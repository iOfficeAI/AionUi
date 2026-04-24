/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  loadPresetAssistantResources,
  type PresetAssistantResourceDeps,
} from '../../src/renderer/utils/model/presetAssistantResources';

function createDeps(overrides: Partial<PresetAssistantResourceDeps> = {}): PresetAssistantResourceDeps {
  return {
    readAssistantRule: vi.fn(async () => ''),
    readAssistantSkill: vi.fn(async () => ''),
    getEnabledSkills: vi.fn(async () => undefined),
    getDisabledBuiltinSkills: vi.fn(async () => undefined),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('loadPresetAssistantResources', () => {
  it('returns fallback rules when there is no custom assistant id', async () => {
    const deps = createDeps();

    await expect(
      loadPresetAssistantResources(
        {
          localeKey: 'zh-CN',
          fallbackRules: 'fallback rules',
        },
        deps
      )
    ).resolves.toEqual({
      rules: 'fallback rules',
      skills: '',
      enabled_skills: undefined,
      disabledBuiltinSkills: undefined,
    });
  });

  it('loads user resources and enabled skills first', async () => {
    const deps = createDeps({
      readAssistantRule: vi.fn(async () => 'user rules'),
      readAssistantSkill: vi.fn(async () => 'user skills'),
      getEnabledSkills: vi.fn(async () => ['pptx', 'xlsx']),
    });

    await expect(
      loadPresetAssistantResources(
        {
          custom_agent_id: 'assistant-1',
          localeKey: 'zh-CN',
          fallbackRules: 'fallback rules',
        },
        deps
      )
    ).resolves.toEqual({
      rules: 'user rules',
      skills: 'user skills',
      enabled_skills: ['pptx', 'xlsx'],
      disabledBuiltinSkills: undefined,
    });
  });

  it('falls back to fallbackRules and empty skills, warning twice, when user resources fail', async () => {
    // Backend now serves builtin content via readAssistant{Rule,Skill}, so
    // there is no separate builtin fallback path on the deps anymore — if
    // both throw, callers get the caller-supplied fallbackRules verbatim.
    const deps = createDeps({
      readAssistantRule: vi.fn(async () => {
        throw new Error('missing user rule');
      }),
      readAssistantSkill: vi.fn(async () => {
        throw new Error('missing user skill');
      }),
      getEnabledSkills: vi.fn(async () => ['moltbook']),
    });

    const result = await loadPresetAssistantResources(
      {
        custom_agent_id: 'builtin-cowork',
        localeKey: 'zh-CN',
        fallbackRules: 'fallback rules',
      },
      deps
    );

    expect(result).toEqual({
      rules: 'fallback rules',
      skills: '',
      enabled_skills: ['moltbook'],
      disabledBuiltinSkills: undefined,
    });
    expect(deps.warn).toHaveBeenCalledTimes(2);
  });
});
