import { describe, expect, it } from 'vitest';
import {
  filterHooksByQuery,
  summarizeHookLibrary,
} from '../../src/renderer/pages/settings/AgentSettings/hookLibraryUtils';

describe('hookLibraryUtils', () => {
  const hooks = [
    {
      name: 'quality-gate',
      description: 'Run validation expectations',
      location: '/tmp/builtin/quality-gate',
      isCustom: false,
    },
    {
      name: 'custom-guard',
      description: 'Custom tool safety guard',
      location: '/tmp/custom/custom-guard',
      isCustom: true,
    },
  ];

  it('filters hooks by name, description, and location', () => {
    expect(filterHooksByQuery(hooks, 'quality')).toEqual([hooks[0]]);
    expect(filterHooksByQuery(hooks, 'safety')).toEqual([hooks[1]]);
    expect(filterHooksByQuery(hooks, '/tmp/custom')).toEqual([hooks[1]]);
    expect(filterHooksByQuery(hooks, '')).toEqual(hooks);
  });

  it('summarizes builtin and custom hook counts', () => {
    expect(summarizeHookLibrary(hooks)).toEqual({
      total: 2,
      custom: 1,
      builtin: 1,
    });
  });
});
