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
    readBuiltinRule: vi.fn(async () => ''),
    readBuiltinSkill: vi.fn(async () => ''),
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

  it('falls back to builtin preset resources and warns when user resources fail', async () => {
    const deps = createDeps({
      readAssistantRule: vi.fn(async () => {
        throw new Error('missing user rule');
      }),
      readAssistantSkill: vi.fn(async () => {
        throw new Error('missing user skill');
      }),
      readBuiltinRule: vi.fn(async () => 'builtin rules'),
      readBuiltinSkill: vi.fn(async () => 'builtin skills'),
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
      rules: 'builtin rules',
      skills: 'builtin skills',
      enabled_skills: ['moltbook'],
      disabledBuiltinSkills: undefined,
    });
    expect(deps.readBuiltinRule).toHaveBeenCalledOnce();
    expect(deps.readBuiltinSkill).toHaveBeenCalledOnce();
    expect(deps.warn).toHaveBeenCalledTimes(2);
  });
});
