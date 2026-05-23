// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readAssistantRule: { invoke: vi.fn() },
      readAssistantSkill: { invoke: vi.fn() },
    },
  },
}));

import { usePresetAssistantResolver } from '@/renderer/pages/guid/hooks/usePresetAssistantResolver';
import type { Assistant } from '@/common/types/agent/assistantTypes';

describe('usePresetAssistantResolver', () => {
  it('resolves builtin enabled_skills for preset assistants', () => {
    const assistants: Assistant[] = [
      {
        id: 'ozon-assistants',
        source: 'builtin',
        name: 'Ozon Assistants',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        preset_agent_type: 'aionrs',
        enabled_skills: ['pounding-ozon'],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
      },
    ];

    const { result } = renderHook(() =>
      usePresetAssistantResolver({
        assistants,
        localeKey: 'zh-CN',
      })
    );

    expect(
      result.current.resolveEnabledSkills({
        agent_type: 'aionrs',
        backend: 'aionrs',
        custom_agent_id: 'ozon-assistants',
      })
    ).toEqual(['pounding-ozon']);
  });

  it('returns undefined when builtin assistant has no enabled skills', () => {
    const assistants: Assistant[] = [
      {
        id: 'plain-builtin',
        source: 'builtin',
        name: 'Plain Builtin',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        preset_agent_type: 'aionrs',
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
      },
    ];

    const { result } = renderHook(() =>
      usePresetAssistantResolver({
        assistants,
        localeKey: 'zh-CN',
      })
    );

    expect(
      result.current.resolveEnabledSkills({
        agent_type: 'aionrs',
        backend: 'aionrs',
        custom_agent_id: 'plain-builtin',
      })
    ).toBeUndefined();
  });
});
