import { describe, expect, it } from 'vitest';

import { renderHermesMcpServersYaml } from '@/process/commandEve/runtimeBootstrapCore';

describe('renderHermesMcpServersYaml', () => {
  it('renders the inline empty map for no vetted connectors (identical to the prior literal)', () => {
    expect(renderHermesMcpServersYaml([])).toEqual(['mcp_servers: {}']);
  });

  it('renders a stdio connector with args and env, all values quoted', () => {
    const lines = renderHermesMcpServersYaml([
      { id: 'context7', command: 'npx', args: ['-y', '@upstash/context7-mcp'], env: { LOG_LEVEL: 'info' } },
    ]);
    expect(lines).toEqual([
      'mcp_servers:',
      '  "context7":',
      '    command: "npx"',
      '    args:',
      '      - "-y"',
      '      - "@upstash/context7-mcp"',
      '    env:',
      '      "LOG_LEVEL": "info"',
    ]);
  });

  it('emits empty inline collections for a connector without args or env', () => {
    const lines = renderHermesMcpServersYaml([{ id: 'bare', command: 'run-bare' }]);
    expect(lines).toEqual(['mcp_servers:', '  "bare":', '    command: "run-bare"', '    args: []', '    env: {}']);
  });

  it('renders multiple connectors in order', () => {
    const lines = renderHermesMcpServersYaml([
      { id: 'a', command: 'cmd-a' },
      { id: 'b', command: 'cmd-b' },
    ]);
    expect(lines.filter((line) => line.endsWith(':') && line.startsWith('  '))).toEqual(['  "a":', '  "b":']);
  });

  it('quote-escapes ids and values that contain special characters (no YAML injection)', () => {
    const lines = renderHermesMcpServersYaml([
      { id: 'evil: key', command: 'cmd', env: { 'A B': 'x: y # z' } },
    ]);
    expect(lines).toContain('  "evil: key":');
    expect(lines).toContain('      "A B": "x: y # z"');
  });
});
