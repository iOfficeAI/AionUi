/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { buildAssistantEditorBackends } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

describe('buildAssistantEditorBackends', () => {
  it('derives editor backends from supported management agents and allows unchecked agents', () => {
    const agents: ManagedAgent[] = [
      managedAgent({ id: 'agent-cursor', backend: 'cursor', name: 'Cursor', status: 'unchecked' }),
      managedAgent({ id: 'agent-claude', backend: 'claude', name: 'Claude Code', status: 'online' }),
      managedAgent({
        id: 'agent-nanobot',
        backend: 'nanobot',
        agent_type: 'nanobot',
        name: 'Nanobot',
        status: 'online',
      }),
      managedAgent({
        id: 'agent-openclaw',
        backend: 'openclaw-gateway',
        agent_type: 'openclaw-gateway',
        name: 'OpenClaw Gateway',
        status: 'unchecked',
      }),
      managedAgent({
        id: 'agent-remote',
        backend: 'remote',
        agent_type: 'remote',
        name: 'Remote',
        status: 'online',
      }),
      managedAgent({ id: 'agent-goose', backend: 'goose', name: 'Goose', status: 'offline' }),
      managedAgent({ id: 'agent-snow', backend: 'snow', name: 'Snow', status: 'missing' }),
    ];

    expect(buildAssistantEditorBackends(agents, 'en-US')).toEqual([
      {
        id: 'agent-cursor',
        name: 'Cursor',
        runtimeKey: 'cursor',
        modelOptions: [],
      },
      {
        id: 'agent-claude',
        name: 'Claude Code',
        runtimeKey: 'claude',
        modelOptions: [],
      },
    ]);
  });

  it('uses localized management names and falls back to agent_type when backend is empty', () => {
    const agents: ManagedAgent[] = [
      managedAgent({
        id: 'agent-aionrs',
        backend: undefined,
        agent_type: 'aionrs',
        name: 'Aion CLI',
        name_i18n: { 'zh-CN': 'Aion 命令行' },
        status: 'online',
      }),
    ];

    expect(buildAssistantEditorBackends(agents, 'zh-CN')).toEqual([
      {
        id: 'agent-aionrs',
        name: 'Aion 命令行',
        runtimeKey: 'aionrs',
        modelOptions: [],
      },
    ]);
  });

  it('keeps the current binding visible even when it is known unavailable', () => {
    const agents: ManagedAgent[] = [
      managedAgent({ id: 'agent-claude', backend: 'claude', name: 'Claude Code', status: 'online' }),
      managedAgent({ id: 'agent-goose', backend: 'goose', name: 'Goose', status: 'offline' }),
    ];

    expect(buildAssistantEditorBackends(agents, 'en-US', 'agent-goose')).toEqual([
      {
        id: 'agent-claude',
        name: 'Claude Code',
        runtimeKey: 'claude',
        modelOptions: [],
      },
      {
        id: 'agent-goose',
        name: 'Goose',
        runtimeKey: 'goose',
        modelOptions: [],
      },
    ]);
  });
});

function managedAgent(overrides: Partial<ManagedAgent> & { id: string; name: string }): ManagedAgent {
  return {
    id: overrides.id,
    icon: undefined,
    name: overrides.name,
    name_i18n: overrides.name_i18n,
    description: undefined,
    description_i18n: undefined,
    backend: overrides.backend ?? 'claude',
    agent_type: overrides.agent_type ?? 'acp',
    agent_source: overrides.agent_source ?? 'builtin',
    agent_source_info: {},
    enabled: overrides.enabled ?? true,
    installed: overrides.installed ?? true,
    command: overrides.command ?? overrides.backend ?? 'claude',
    args: [],
    env: [],
    behavior_policy: { supports_team: true },
    sort_order: overrides.sort_order ?? 0,
    team_capable: overrides.team_capable ?? true,
    status: overrides.status ?? 'online',
    ...overrides,
  } as ManagedAgent;
}
