/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standalone stdio MCP server for Aion team-guide tools.
 *
 * Spawned by Claude CLI as a stdio MCP server. Communicates with
 * the main process TCP server via AION_MCP_PORT environment variable.
 *
 * TCP protocol: 4-byte big-endian length header + UTF-8 JSON body.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as net from 'node:net';

const AION_MCP_TOKEN = process.env.AION_MCP_TOKEN || undefined;
process.stderr.write(
  `[aion-mcp-stdio] Script started. PID=${process.pid}, AION_MCP_PORT=${process.env.AION_MCP_PORT || 'unset'}\n`
);
const AION_MCP_PORT = parseInt(process.env.AION_MCP_PORT || '0', 10);

if (!AION_MCP_PORT) {
  process.stderr.write('AION_MCP_PORT environment variable is required\n');
  process.exit(1);
}

if (!AION_MCP_TOKEN) {
  process.stderr.write('AION_MCP_TOKEN environment variable is required\n');
  process.exit(1);
}

// ── TCP helpers ──────────────────────────────────────────────────────────────

function sendTcpRequest(port: number, data: unknown): Promise<{ result?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      const json = JSON.stringify(data);
      const body = Buffer.from(json, 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      socket.write(Buffer.concat([header, body]));
    });

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
    });

    socket.on('end', () => {
      if (buffer.length < 4) {
        reject(new Error('Incomplete TCP response'));
        return;
      }
      const bodyLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + bodyLen) {
        reject(new Error('Incomplete TCP response body'));
        return;
      }
      const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
      try {
        resolve(JSON.parse(jsonStr) as { result?: string; error?: string });
      } catch (err) {
        reject(new Error(`Failed to parse TCP response: ${(err as Error).message}`));
      }
    });

    socket.on('error', (err: Error) => {
      reject(new Error(`TCP connection error: ${err.message}`));
    });

    socket.setTimeout(300_000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('TCP request timeout'));
    });
  });
}

// ── Tool helper ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createAionTool(
  server: McpServer,
  toolName: string,
  description: string,
  schema: any,
  tcpPort: number,
  authToken: string | undefined
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.tool(toolName, description, schema, async (args: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = { tool: toolName, args, auth_token: authToken };
      const response = await sendTcpRequest(tcpPort, payload);

      if (response.error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: response.result || '' }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'aionui-team-guide', version: '1.0.0' }, { capabilities: { tools: {} } });

// ---- aion_create_team ----
createAionTool(
  server,
  'aion_create_team',
  `Create a multi-agent Team to handle complex tasks collaboratively.

WHEN TO USE: Any task where a team produces better results or higher efficiency than working solo — building projects, features, tools, games, websites, or anything benefiting from parallel work and role specialization (dev + test + review). Do NOT use for simple Q&A, translation, single-point fixes, or information lookup.

PRECONDITIONS (all must be true before calling — NEVER skip):
1. You determined this task benefits from a team.
2. You presented a team configuration (roles, responsibilities, agent types) to the user.
3. The user explicitly confirmed in a PREVIOUS message (e.g. "ok", "go ahead", "确认").
If ANY condition is not met, do NOT call this tool — present the configuration and wait.

This is the ONLY way to create teams — do NOT use any built-in or other team/agent tools.
The summary MUST include both the task goal and the confirmed team member roles.

IMPORTANT: Read the response carefully and follow the next_step instructions.`,
  {
    summary: z.string().min(1).describe('Task summary or initial instruction to send to the team lead agent.'),
    name: z.string().optional().describe('Optional team name. When omitted the first few words of summary are used.'),
    workspace: z
      .string()
      .optional()
      .describe(
        'Absolute path to the project workspace directory. Team agents will use this as their shared working directory. When omitted a temporary workspace is created.'
      ),
  },
  AION_MCP_PORT,
  AION_MCP_TOKEN
);

// ---- aion_navigate ----
createAionTool(
  server,
  'aion_navigate',
  `Navigate the Aion UI to a specific route.

Use this tool after creating a team (or opening a conversation) to switch the
application view so the user can see the result. Only whitelisted route patterns
are accepted (/team/:id, /conversation/:id).`,
  {
    route: z.string().min(1).describe('Target route, e.g. "/team/abc123" or "/conversation/xyz456".'),
  },
  AION_MCP_PORT,
  AION_MCP_TOKEN
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`[aion-mcp-stdio] Fatal error: ${err}\n`);
  process.exit(1);
});
