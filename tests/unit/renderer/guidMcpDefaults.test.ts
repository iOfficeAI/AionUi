import { describe, expect, it } from 'vitest';

import type { IMcpServer } from '@/common/config/storage';
import { mergeEnabledByDefaultMcpIds } from '@/renderer/pages/guid/utils/mcpDefaults';

const server = (overrides: Partial<IMcpServer> & { id: string }): IMcpServer => ({
  name: overrides.id,
  enabled: false,
  transport: { type: 'stdio', command: 'test' },
  created_at: 0,
  updated_at: 0,
  original_json: '{}',
  ...overrides,
});

describe('mergeEnabledByDefaultMcpIds', () => {
  it('auto-selects default-enabled servers for a new conversation (#3119)', () => {
    const servers = [server({ id: 'memory', enabled: true }), server({ id: 'other', enabled: false })];
    expect(mergeEnabledByDefaultMcpIds([], servers)).toEqual(['memory']);
  });

  it('unions with assistant/user selections without dropping or duplicating them', () => {
    const servers = [server({ id: 'memory', enabled: true }), server({ id: 'assistant-pick', enabled: true })];
    expect(mergeEnabledByDefaultMcpIds(['assistant-pick', 'manual'], servers)).toEqual([
      'assistant-pick',
      'manual',
      'memory',
    ]);
  });

  it('skips disabled and built-in servers', () => {
    const servers = [
      server({ id: 'off', enabled: false }),
      server({ id: 'builtin-one', enabled: true, builtin: true }),
    ];
    expect(mergeEnabledByDefaultMcpIds([], servers)).toEqual([]);
  });

  it('returns the selection unchanged when nothing is default-enabled', () => {
    const servers = [server({ id: 'a', enabled: false })];
    expect(mergeEnabledByDefaultMcpIds(['x'], servers)).toEqual(['x']);
    expect(mergeEnabledByDefaultMcpIds([], [])).toEqual([]);
  });

  it('does not mutate the input selection', () => {
    const selected = ['x'];
    mergeEnabledByDefaultMcpIds(selected, [server({ id: 'memory', enabled: true })]);
    expect(selected).toEqual(['x']);
  });
});
