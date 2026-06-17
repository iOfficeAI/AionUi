/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { buildAssistantEditorBackends } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';

describe('buildAssistantEditorBackends', () => {
  it('derives editor backends from bare assistants only', () => {
    const assistants: Assistant[] = [
      assistant({ id: 'bare-claude', source: 'bare', preset_agent_type: 'claude', name: 'Claude Code' }),
      assistant({ id: 'user-writer', source: 'user', preset_agent_type: 'claude', name: 'Writer' }),
      assistant({ id: 'builtin-research', source: 'builtin', preset_agent_type: 'gemini', name: 'Researcher' }),
    ];

    expect(buildAssistantEditorBackends(assistants, 'en-US')).toEqual([
      {
        id: 'claude',
        name: 'Claude Code',
        modelOptions: [],
      },
    ]);
  });

  it('uses localized bare assistant names and deduplicates by backend', () => {
    const assistants: Assistant[] = [
      assistant({
        id: 'bare-gemini',
        source: 'bare',
        preset_agent_type: 'gemini',
        name: 'Gemini',
        name_i18n: { 'zh-CN': '双子星' },
      }),
      assistant({
        id: 'bare-gemini-second',
        source: 'bare',
        preset_agent_type: 'gemini',
        name: 'Gemini 2',
      }),
    ];

    expect(buildAssistantEditorBackends(assistants, 'zh-CN')).toEqual([
      {
        id: 'gemini',
        name: '双子星',
        modelOptions: [],
      },
    ]);
  });

  it('uses bare assistant models and codex fallback models for editor backend options', () => {
    const assistants: Assistant[] = [
      assistant({
        id: 'bare-claude',
        source: 'bare',
        preset_agent_type: 'claude',
        name: 'Claude Code',
        models: ['claude-sonnet-4', 'claude-opus-4'],
      }),
      assistant({
        id: 'bare-codex',
        source: 'bare',
        preset_agent_type: 'codex',
        name: 'Codex',
      }),
    ];

    expect(buildAssistantEditorBackends(assistants, 'en-US')).toEqual([
      {
        id: 'claude',
        name: 'Claude Code',
        modelOptions: [
          { value: 'claude-sonnet-4', label: 'claude-sonnet-4' },
          { value: 'claude-opus-4', label: 'claude-opus-4' },
        ],
      },
      {
        id: 'codex',
        name: 'Codex',
        modelOptions: DEFAULT_CODEX_MODELS.map((model) => ({ value: model.id, label: model.label })),
      },
    ]);
  });
});

function assistant(overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'source' | 'preset_agent_type' | 'name'>) {
  return {
    id: overrides.id,
    source: overrides.source,
    name: overrides.name,
    name_i18n: overrides.name_i18n ?? {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    preset_agent_type: overrides.preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: overrides.models ?? [],
    agent_status: 'available',
    team_selectable: true,
    deletable: overrides.source === 'user',
    ...overrides,
  } satisfies Assistant;
}
