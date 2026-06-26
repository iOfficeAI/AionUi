/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { buildAssistantEditorBackends } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';

describe('buildAssistantEditorBackends', () => {
  it('derives editor backends from generated assistants only', () => {
    const assistants: Assistant[] = [
      assistant({ id: 'bare-claude', source: 'generated', runtimeKey: 'claude', name: 'Claude Code' }),
      assistant({ id: 'user-writer', source: 'user', runtimeKey: 'claude', name: 'Writer' }),
      assistant({ id: 'builtin-research', source: 'builtin', runtimeKey: 'gemini', name: 'Researcher' }),
    ];

    expect(buildAssistantEditorBackends(assistants, 'en-US')).toEqual([
      {
        id: 'agent-claude',
        name: 'Claude Code',
        runtimeKey: 'claude',
        modelOptions: [],
      },
    ]);
  });

  it('uses localized generated assistant names and deduplicates by agent identity', () => {
    const assistants: Assistant[] = [
      assistant({
        id: 'bare-gemini',
        source: 'generated',
        runtimeKey: 'gemini',
        name: 'Gemini',
        name_i18n: { 'zh-CN': '双子星' },
      }),
      assistant({
        id: 'bare-gemini-second',
        source: 'generated',
        runtimeKey: 'gemini',
        agentId: 'agent-gemini',
        name: 'Gemini 2',
      }),
    ];

    expect(buildAssistantEditorBackends(assistants, 'zh-CN')).toEqual([
      {
        id: 'agent-gemini',
        name: '双子星',
        runtimeKey: 'gemini',
        modelOptions: [],
      },
    ]);
  });

  it('uses generated assistant models for editor backend options', () => {
    const assistants: Assistant[] = [
      assistant({
        id: 'bare-claude',
        source: 'generated',
        runtimeKey: 'claude',
        name: 'Claude Code',
        models: ['claude-sonnet-4', 'claude-opus-4'],
      }),
      assistant({
        id: 'bare-codex',
        source: 'generated',
        runtimeKey: 'codex',
        name: 'Codex',
      }),
    ];

    expect(buildAssistantEditorBackends(assistants, 'en-US')).toEqual([
      {
        id: 'agent-claude',
        name: 'Claude Code',
        runtimeKey: 'claude',
        modelOptions: [
          { value: 'claude-sonnet-4', label: 'claude-sonnet-4' },
          { value: 'claude-opus-4', label: 'claude-opus-4' },
        ],
      },
      {
        id: 'agent-codex',
        name: 'Codex',
        runtimeKey: 'codex',
        modelOptions: [],
      },
    ]);
  });

  it('tolerates generated assistants with missing models arrays', () => {
    const assistants = [
      assistant({
        id: 'bare-droid',
        source: 'generated',
        runtimeKey: 'droid',
        name: 'droid',
        models: undefined,
      }),
    ] as Assistant[];

    expect(buildAssistantEditorBackends(assistants, 'en-US')).toEqual([
      {
        id: 'agent-droid',
        name: 'droid',
        runtimeKey: 'droid',
        modelOptions: [],
      },
    ]);
  });
});

function assistant(
  overrides: Partial<Assistant> & {
    id: string;
    source: Assistant['source'];
    runtimeKey: string;
    name: string;
    agentId?: string;
  }
) {
  const agentId = overrides.agentId ?? `agent-${overrides.runtimeKey}`;
  return {
    id: overrides.id,
    source: overrides.source,
    name: overrides.name,
    name_i18n: overrides.name_i18n ?? {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    agent_id: agentId,
    agent: { type: 'acp', source: 'builtin', acp_backend: overrides.runtimeKey },
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: overrides.models ?? [],
    agent_status: 'online',
    team_selectable: true,
    deletable: overrides.source === 'user',
    ...overrides,
  } satisfies Assistant;
}
