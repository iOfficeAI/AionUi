import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeaLarkAuthService } from '../../src/gea-lark-auth.js';
import { startGeaMcpBridge, type GeaMcpBridgeHandle } from '../../src/gea-mcp-bridge.js';

describe('startGeaMcpBridge', () => {
  let handle: GeaMcpBridgeHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it('exposes authorized GEA tools through Streamable HTTP', async () => {
    const listTools = vi.fn().mockResolvedValue([
      {
        name: 'search_records',
        description: '搜索记录',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        sourceCode: 'mcp-001',
      },
    ]);
    const callTool = vi.fn().mockResolvedValue({ result: '{"data":[]}', auditId: 'audit-1' });
    const authService = {
      createMcpGatewaySession: vi.fn().mockResolvedValue({ listTools, callTool }),
    } as unknown as GeaLarkAuthService;
    handle = await startGeaMcpBridge(authService, 'sales_forecast');

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'search_records', description: '搜索记录' }],
    });
    await expect(client.callTool({ name: 'search_records', arguments: { query: '客户A' } })).resolves.toEqual({
      content: [{ type: 'text', text: '{"data":[]}' }],
    });
    expect(callTool).toHaveBeenCalledWith(expect.objectContaining({ sourceCode: 'mcp-001' }), { query: '客户A' });

    await client.close();
  });

  it('exposes OpenAI-compatible aliases and calls the original GEA tool', async () => {
    const dottedTool = {
      name: 'gateway.session.currentUser.resolve',
      description: '解析当前用户',
      inputSchema: { type: 'object', properties: {} },
      sourceCode: 'mcp-current-user',
    };
    const callTool = vi.fn().mockResolvedValue({ result: '{"id":"user-1"}' });
    const authService = {
      createMcpGatewaySession: vi.fn().mockResolvedValue({
        listTools: vi.fn().mockResolvedValue([dottedTool]),
        callTool,
      }),
    } as unknown as GeaLarkAuthService;
    handle = await startGeaMcpBridge(authService, 'sales_forecast');

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'gateway_session_currentUser_resolve' }],
    });
    await expect(client.callTool({ name: 'gateway_session_currentUser_resolve', arguments: {} })).resolves.toEqual({
      content: [{ type: 'text', text: '{"id":"user-1"}' }],
    });
    expect(callTool).toHaveBeenCalledWith(dottedTool, {});

    await client.close();
  });
});
