import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock platform services
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      getName: () => 'AionUi',
      getVersion: () => '1.0.0',
    },
  }),
}));

// Mock SDK transports
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));
vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn().mockResolvedValue({}),
  getNpxCacheDir: vi.fn().mockReturnValue('/tmp/npx-cache'),
  normalizeNpxArgsForBundledBun: vi.fn((args: string[]) =>
    args.filter((arg) => arg !== '-y' && arg !== '--yes' && arg !== '--prefer-offline')
  ),
  resolveNpxPath: vi.fn().mockReturnValue('/usr/local/bin/bun'),
}));
vi.mock('fs', () => ({ promises: { access: vi.fn() } }));
vi.mock('@process/utils/safeExec', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

import type { McpConnectionTestResult, McpOperationResult } from '@process/services/mcpServices/McpProtocol';
import type { IMcpServer } from '@/common/config/storage';

// Create a concrete test subclass to access protected methods
class TestAgent {
  private agent: InstanceType<typeof import('@process/services/mcpServices/McpProtocol').AbstractMcpAgent>;

  constructor(agent: any) {
    this.agent = agent;
  }

  testHttpConnection(transport: { url: string; headers?: Record<string, string> }) {
    return (this.agent as any).testHttpConnection(transport);
  }

  testMcpConnection(serverOrTransport: IMcpServer | IMcpServer['transport']) {
    return this.agent.testMcpConnection(serverOrTransport);
  }
}

describe('AbstractMcpAgent', () => {
  let testAgent: TestAgent;

  beforeEach(async () => {
    vi.resetModules();

    const { AbstractMcpAgent } = await import('@process/services/mcpServices/McpProtocol');

    // Create a minimal concrete subclass
    class ConcreteAgent extends AbstractMcpAgent {
      constructor() {
        super('aionui', 5000);
      }
      detectMcpServers(): Promise<IMcpServer[]> {
        return Promise.resolve([]);
      }
      installMcpServers(): Promise<McpOperationResult> {
        return Promise.resolve({ success: true });
      }
      removeMcpServer(): Promise<McpOperationResult> {
        return Promise.resolve({ success: true });
      }
      getSupportedTransports(): string[] {
        return ['http', 'streamable_http', 'stdio'];
      }
    }

    testAgent = new TestAgent(new ConcreteAgent());
  });

  describe('testHttpConnection', () => {
    it('should return needsAuth when server responds with 401 and WWW-Authenticate Bearer', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 401,
          statusText: 'Unauthorized',
          ok: false,
          headers: new Headers({ 'WWW-Authenticate': 'Bearer realm="mcp"' }),
        })
      );

      const result = await testAgent.testHttpConnection({ url: 'http://localhost:3000/mcp' });

      expect(result.success).toBe(false);
      expect(result.needsAuth).toBe(true);
      expect(result.authMethod).toBe('oauth');
      expect(result.wwwAuthenticate).toBe('Bearer realm="mcp"');

      vi.unstubAllGlobals();
    });

    it('should return error for 401 without WWW-Authenticate header', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 401,
          statusText: 'Unauthorized',
          ok: false,
          headers: new Headers(),
        })
      );

      const result = await testAgent.testHttpConnection({ url: 'http://localhost:3000/mcp' });

      expect(result.success).toBe(false);
      expect(result.needsAuth).toBeUndefined();
      expect(result.error).toBe('HTTP 401: Unauthorized');

      vi.unstubAllGlobals();
    });

    it('should return error for non-OK responses', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 500,
          statusText: 'Internal Server Error',
          ok: false,
          headers: new Headers(),
        })
      );

      const result = await testAgent.testHttpConnection({ url: 'http://localhost:3000/mcp' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 500: Internal Server Error');

      vi.unstubAllGlobals();
    });

    it('should return error on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

      const result = await testAgent.testHttpConnection({ url: 'http://localhost:3000/mcp' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');

      vi.unstubAllGlobals();
    });

    it('should delegate to testStreamableHttpConnection on successful probe', async () => {
      const cancelFn = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          ok: true,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          body: { cancel: cancelFn },
        })
      );

      // The delegation will fail because SDK is mocked, but we verify
      // it reaches that path (error comes from SDK mock, not probe)
      const result = await testAgent.testHttpConnection({ url: 'http://localhost:3000/mcp' });

      // Probe body should be cancelled before delegation
      expect(cancelFn).toHaveBeenCalled();
      // Result comes from testStreamableHttpConnection (will fail due to SDK mock)
      expect(result).toBeDefined();

      vi.unstubAllGlobals();
    });
  });

  describe('testMcpConnection - _meta preservation', () => {
    it('should route http type to testHttpConnection', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test')));

      const result = await testAgent.testMcpConnection({
        type: 'http' as const,
        url: 'http://localhost:3000/mcp',
      });

      expect(result.success).toBe(false);

      vi.unstubAllGlobals();
    });

    it('should translate npx stdio transports to bundled bun', async () => {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

      vi.mocked(Client).mockImplementation(function MockClient() {
        return {
          connect: vi.fn().mockResolvedValue(undefined),
          listTools: vi.fn().mockResolvedValue({ tools: [] }),
          close: vi.fn().mockResolvedValue(undefined),
        } as any;
      } as any);
      vi.mocked(StdioClientTransport).mockImplementation(function MockTransport(config: unknown) {
        return config as any;
      } as any);

      const result = await testAgent.testMcpConnection({
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/workspace'],
      });

      expect(result.success).toBe(true);
      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: '/usr/local/bin/bun',
          args: ['x', '--bun', '@modelcontextprotocol/server-filesystem', '/tmp/workspace'],
        })
      );
    });
  });
});
