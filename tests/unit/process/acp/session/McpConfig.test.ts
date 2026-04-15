// tests/unit/process/acp/session/McpConfig.test.ts
import { describe, it, expect } from 'vitest';
import { McpConfig } from '@process/acp/session/McpConfig';
import type { McpServerConfig } from '@process/acp/types';

describe('McpConfig', () => {
  it('returns user config when no presets or team config', () => {
    const user: McpServerConfig[] = [{ name: 'my-mcp', command: 'mcp-serve' }];
    const result = McpConfig.merge({ userServers: user });
    expect(result).toEqual(user);
  });
  it('user config overrides preset with same name', () => {
    const result = McpConfig.merge({
      userServers: [{ name: 'fs', command: 'user-fs' }],
      presetServers: [{ name: 'fs', command: 'preset-fs' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe('user-fs');
  });
  it('team MCP is always appended', () => {
    const result = McpConfig.merge({
      userServers: [{ name: 'a', command: 'a' }],
      teamServer: { name: 'team', command: 'team-mcp' },
    });
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe('team');
  });
  it('merges all three sources with correct priority', () => {
    const result = McpConfig.merge({
      userServers: [{ name: 'a', command: 'user-a' }],
      presetServers: [
        { name: 'a', command: 'preset-a' },
        { name: 'b', command: 'preset-b' },
      ],
      teamServer: { name: 'team', command: 'team' },
    });
    expect(result).toHaveLength(3);
    expect(result.find((s) => s.name === 'a')!.command).toBe('user-a');
    expect(result.find((s) => s.name === 'b')!.command).toBe('preset-b');
    expect(result.find((s) => s.name === 'team')!.command).toBe('team');
  });
});
