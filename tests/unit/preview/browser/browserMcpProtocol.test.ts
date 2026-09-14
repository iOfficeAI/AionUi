import { describe, expect, it } from 'vitest';
import {
  BROWSER_MCP_TOOL_PREFIX,
  createBrowserMcpProtocolTransformer,
} from '@/process/resources/builtinMcp/browserMcpProtocol';

describe('built-in browser MCP protocol transformer', () => {
  it('renames the upstream server and its tools', () => {
    const protocol = createBrowserMcpProtocolTransformer();

    protocol.transformClientMessage(
      JSON.stringify({
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'codex' } },
      })
    );
    const initializeResult = JSON.parse(
      protocol.transformServerMessage(
        JSON.stringify({
          id: 1,
          result: { serverInfo: { name: 'chrome_devtools', version: '0.1.0' } },
        })
      )
    ) as { result: { serverInfo: { name: string; title: string } } };

    expect(initializeResult.result.serverInfo).toMatchObject({
      name: 'aibang-browser',
      title: 'AIbang in-app browser',
    });

    protocol.transformClientMessage(JSON.stringify({ id: 2, method: 'tools/list' }));
    const toolListResult = JSON.parse(
      protocol.transformServerMessage(
        JSON.stringify({
          id: 2,
          result: { tools: [{ name: 'navigate_page' }, { name: 'take_screenshot' }] },
        })
      )
    ) as { result: { tools: Array<{ name: string }> } };

    expect(toolListResult.result.tools.map((tool) => tool.name)).toEqual([
      `${BROWSER_MCP_TOOL_PREFIX}navigate_page`,
      `${BROWSER_MCP_TOOL_PREFIX}take_screenshot`,
    ]);
  });

  it('restores the upstream tool name when Codex calls a prefixed tool', () => {
    const protocol = createBrowserMcpProtocolTransformer();
    const call = JSON.parse(
      protocol.transformClientMessage(
        JSON.stringify({
          id: 3,
          method: 'tools/call',
          params: { name: `${BROWSER_MCP_TOOL_PREFIX}navigate_page`, arguments: { url: 'https://aionui.com' } },
        })
      )
    ) as { params: { name: string } };

    expect(call.params.name).toBe('navigate_page');
  });
});
