import { createHash, randomUUID } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  GeaMcpGatewayError,
  type GeaLarkAuthService,
  type GeaMcpGatewaySession,
  type GeaMcpGatewayTool,
} from './gea-lark-auth.js';

type BridgeSession = {
  server: Server;
  transport: StreamableHTTPServerTransport;
};

type ExposedGeaMcpGatewayTool = {
  exposedName: string;
  tool: GeaMcpGatewayTool;
};

export type GeaMcpBridgeHandle = {
  close: () => Promise<void>;
  url: string;
};

function writeJsonError(res: ServerResponse, statusCode: number, message: string): void {
  res.writeHead(statusCode, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const hostname = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':', 1)[0];
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function errorCode(error: unknown): string {
  return error instanceof GeaMcpGatewayError ? error.code : 'GEA_MCP_BRIDGE_ERROR';
}

function resultText(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? null);
}

const MAX_TOOL_NAME_LENGTH = 64;

function createCompatibleToolName(name: string, usedNames: Set<string>): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'gea_tool';
  if (sanitized.length <= MAX_TOOL_NAME_LENGTH && !usedNames.has(sanitized)) {
    return sanitized;
  }

  for (let attempt = 0; ; attempt += 1) {
    const digest = createHash('sha256').update(`${name}\0${attempt}`).digest('hex').slice(0, 8);
    const prefix = sanitized.slice(0, MAX_TOOL_NAME_LENGTH - digest.length - 1);
    const candidate = `${prefix}_${digest}`;
    if (!usedNames.has(candidate)) return candidate;
  }
}

function createMcpServer(authService: GeaLarkAuthService, agentCode: string): Server {
  const server = new Server(
    { name: 'gea-gateway', version: '1.0.0' },
    {
      capabilities: { tools: {} },
    }
  );
  let gatewaySession: GeaMcpGatewaySession | null = null;
  let toolsByName = new Map<string, GeaMcpGatewayTool>();

  const loadTools = async (): Promise<ExposedGeaMcpGatewayTool[]> => {
    gatewaySession ??= await authService.createMcpGatewaySession(agentCode);
    const tools = await gatewaySession.listTools();
    const nextTools = new Map<string, GeaMcpGatewayTool>();
    const originalNames = new Set<string>();
    for (const tool of tools) {
      if (originalNames.has(tool.name)) {
        throw new GeaMcpGatewayError('GEA_MCP_DUPLICATE_TOOL_NAME');
      }
      originalNames.add(tool.name);
      const exposedName = createCompatibleToolName(tool.name, new Set(nextTools.keys()));
      nextTools.set(exposedName, tool);
    }
    toolsByName = nextTools;
    return [...nextTools].map(([exposedName, tool]) => ({ exposedName, tool }));
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await loadTools();
    return {
      tools: tools.map(({ exposedName, tool }) => ({
        name: exposedName,
        inputSchema: tool.inputSchema,
        ...(tool.description ? { description: tool.description } : {}),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (!gatewaySession || !toolsByName.has(request.params.name)) {
        await loadTools();
      }
      const tool = toolsByName.get(request.params.name);
      if (!tool || !gatewaySession) {
        return { isError: true, content: [{ type: 'text', text: 'GEA_MCP_TOOL_NOT_FOUND' }] };
      }
      const argumentsValue =
        request.params.arguments && typeof request.params.arguments === 'object' ? request.params.arguments : {};
      const result = await gatewaySession.callTool(tool, argumentsValue);
      return { content: [{ type: 'text', text: resultText(result.result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: errorCode(error) }] };
    }
  });

  return server;
}

export async function startGeaMcpBridge(
  authService: GeaLarkAuthService,
  agentCode: string
): Promise<GeaMcpBridgeHandle> {
  const normalizedAgentCode = agentCode.trim();
  if (!normalizedAgentCode) {
    throw new GeaMcpGatewayError('GEA_AGENT_CODE_MISSING');
  }

  const sessions = new Map<string, BridgeSession>();
  const httpServer = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!isLoopbackHost(req.headers.host)) {
        writeJsonError(res, 403, 'Forbidden');
        return;
      }
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      if (pathname !== '/mcp' || !['GET', 'POST', 'DELETE'].includes(req.method ?? '')) {
        writeJsonError(res, 404, 'Not found');
        return;
      }

      const sessionIdHeader = req.headers['mcp-session-id'];
      const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
      let bridgeSession = sessionId ? sessions.get(sessionId) : undefined;

      if (!bridgeSession && !sessionId && req.method === 'POST') {
        const server = createMcpServer(authService, normalizedAgentCode);
        let transport!: StreamableHTTPServerTransport;
        transport = new StreamableHTTPServerTransport({
          enableJsonResponse: true,
          sessionIdGenerator: randomUUID,
          onsessioninitialized: (initializedSessionId) => {
            sessions.set(initializedSessionId, { server, transport });
          },
          onsessionclosed: (closedSessionId) => {
            sessions.delete(closedSessionId);
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        await server.connect(transport);
        bridgeSession = { server, transport };
      }

      if (!bridgeSession) {
        writeJsonError(res, 400, 'Invalid or missing MCP session');
        return;
      }
      await bridgeSession.transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) writeJsonError(res, 500, 'Internal server error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('GEA MCP bridge failed to bind');
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: async () => {
      await Promise.allSettled([...sessions.values()].map(({ server }) => server.close()));
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
