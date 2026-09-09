// Protocol-only probe: no tool calls, credentials, or external service requests.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = new Client({ name: 'local-build-wire', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'out/main/builtin-mcp-lark-cli.js')],
  env: { PATH: process.env.PATH || '' },
  stderr: 'pipe',
});
const deadline = setTimeout(() => {
  void transport.close();
  process.exitCode = 1;
}, 15000);
try {
  await client.connect(transport);
  const result = await client.listTools({}, { timeout: 10000 });
  assert.ok(result.tools.length > 0, 'The builtin MCP must advertise tools');
  assert.ok(result.tools.every((tool) => tool.name && tool.inputSchema.type === 'object'));
  console.log(
    JSON.stringify({
      status: 'ok',
      coverage: 'stdio initialize, tools/list, close; no business tool execution',
      tools: result.tools.map((tool) => tool.name),
    })
  );
} finally {
  await client.close();
  clearTimeout(deadline);
}
