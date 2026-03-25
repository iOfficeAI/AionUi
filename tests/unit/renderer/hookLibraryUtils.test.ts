import { describe, expect, it } from 'vitest';
import {
  filterHooksByQuery,
  summarizeHookLibrary,
} from '../../../src/renderer/pages/settings/AgentSettings/hookLibraryUtils';
import type { HookInfo } from '../../../src/renderer/pages/settings/AgentSettings/AssistantManagement/types';

const HOOKS: HookInfo[] = [
  {
    name: 'prompt-guard',
    description: 'Protects prompts before send',
    location: '/hooks/prompt-guard',
    isCustom: true,
  },
  {
    name: 'builtin-audit',
    description: 'Builtin audit trail',
    location: '/builtin/hooks/audit',
    isCustom: false,
  },
];

describe('filterHooksByQuery', () => {
  it('returns all hooks when query is empty', () => {
    expect(filterHooksByQuery(HOOKS, '')).toEqual(HOOKS);
  });

  it('matches hook name, description, and location case-insensitively', () => {
    expect(filterHooksByQuery(HOOKS, 'guard')).toEqual([HOOKS[0]]);
    expect(filterHooksByQuery(HOOKS, 'AUDIT')).toEqual([HOOKS[1]]);
    expect(filterHooksByQuery(HOOKS, '/hooks/prompt')).toEqual([HOOKS[0]]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterHooksByQuery(HOOKS, 'missing')).toEqual([]);
  });
});

describe('summarizeHookLibrary', () => {
  it('counts total, custom, and builtin hooks', () => {
    expect(summarizeHookLibrary(HOOKS)).toEqual({
      total: 2,
      custom: 1,
      builtin: 1,
    });
  });

  it('returns zero counts for an empty library', () => {
    expect(summarizeHookLibrary([])).toEqual({
      total: 0,
      custom: 0,
      builtin: 0,
    });
  });
});
