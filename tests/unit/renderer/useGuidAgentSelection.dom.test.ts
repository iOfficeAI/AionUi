/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import {
  buildAgentRuntimeModeState,
  buildAgentRuntimeModelInfo,
  buildAssistantModelInfo,
  resolveInitialAssistantModel,
  useGuidAssistantSelection,
} from '@/renderer/pages/guid/hooks/useGuidAssistantSelection';

let mockAssistants: Assistant[] = [];
let mockManagedAgents: ManagedAgent[] = [];

vi.mock('@/renderer/pages/guid/hooks/useCustomAgentsLoader', () => ({
  useCustomAgentsLoader: () => ({
    assistants: mockAssistants,
  }),
}));

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  useManagedAgentRuntimeCatalog: () => mockManagedAgents,
}));

describe('useGuidAssistantSelection', () => {
  beforeEach(() => {
    mockManagedAgents = [];
    mockAssistants = [
      {
        id: 'assistant-claude',
        source: 'builtin',
        name: 'Claude Assistant',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        agent_id: 'agent-claude',
        agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: ['claude-opus', 'claude-sonnet'],
        agent_status: 'online',
        team_selectable: true,
        deletable: false,
      } satisfies Assistant,
    ];
  });

  it('derives availability and model info from assistant catalog data', async () => {
    const { result } = renderHook(() =>
      useGuidAssistantSelection({
        resetAssistant: false,
      })
    );

    await waitFor(() => {
      expect(result.current.selectedAssistantId).toBe('assistant-claude');
    });

    expect(result.current.selectedAssistantAvailable).toBe(true);
    expect(result.current.selectedAcpModel).toBe('claude-opus');
    expect(result.current.currentAcpCachedModelInfo).toEqual({
      current_model_id: 'claude-opus',
      current_model_label: 'claude-opus',
      available_models: [
        { id: 'claude-opus', label: 'claude-opus' },
        { id: 'claude-sonnet', label: 'claude-sonnet' },
      ],
    });
  });

  it('does not synthesize a backend slug when no assistants exist', async () => {
    vi.resetModules();
    vi.doMock('@/renderer/pages/guid/hooks/useCustomAgentsLoader', () => ({
      useCustomAgentsLoader: () => ({
        assistants: [],
      }),
    }));

    const { useGuidAssistantSelection: useSelectionWithoutAssistants } =
      await import('@/renderer/pages/guid/hooks/useGuidAssistantSelection');

    const { result } = renderHook(() =>
      useSelectionWithoutAssistants({
        resetAssistant: false,
      })
    );

    await waitFor(() => {
      expect(result.current.selectedAssistantId).toBeNull();
    });

    expect(result.current.defaultAssistantId).toBeNull();
    expect(result.current.selectedAssistantBackend).toBe('');
    expect(result.current.selectedAssistantAvailable).toBe(false);

    vi.doUnmock('@/renderer/pages/guid/hooks/useCustomAgentsLoader');
    vi.resetModules();
  });

  it('uses the selected assistant agent_id to read runtime catalogs from managed agents', async () => {
    mockAssistants = [
      {
        id: 'custom-1781258588874-26ad',
        source: 'user',
        name: '文件规划助手 (Copy)',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        agent_id: '2d23ff1c',
        agent: {
          type: 'acp',
          source: 'builtin',
          acp_backend: 'claude',
        },
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
        agent_status: 'online',
        team_selectable: true,
        deletable: true,
      } satisfies Assistant,
    ];
    mockManagedAgents = [
      {
        id: '2d23ff1c',
        backend: 'claude',
        available_models: {
          current_model_id: 'global.anthropic.claude-opus-4-8',
          current_model_label: 'Opus 4.8',
          available_models: [
            { id: 'default', label: 'Default' },
            { id: 'global.anthropic.claude-opus-4-8', label: 'Opus 4.8' },
          ],
        },
        available_modes: {
          current_mode_id: 'bypassPermissions',
          available_modes: [
            { id: 'default', name: 'Default' },
            { id: 'bypassPermissions', name: 'Bypass Permissions' },
          ],
        },
      } as unknown as ManagedAgent,
    ];

    const { result } = renderHook(() =>
      useGuidAssistantSelection({
        resetAssistant: false,
      })
    );

    await waitFor(() => {
      expect(result.current.selectedAssistantId).toBe('custom-1781258588874-26ad');
    });

    expect(result.current.selectedAcpModel).toBe('global.anthropic.claude-opus-4-8');
    expect(result.current.currentAcpCachedModelInfo).toEqual({
      current_model_id: 'global.anthropic.claude-opus-4-8',
      current_model_label: 'Opus 4.8',
      available_models: [
        { id: 'default', label: 'Default' },
        { id: 'global.anthropic.claude-opus-4-8', label: 'Opus 4.8' },
      ],
    });
    expect(result.current.selectedMode).toBe('bypassPermissions');
    expect(result.current.currentAgentModeOptions).toEqual([
      { value: 'default', label: 'Default', description: undefined },
      { value: 'bypassPermissions', label: 'Bypass Permissions', description: undefined },
    ]);
  });

  it('keeps the full runtime model list when assistant models only contain a default', async () => {
    mockAssistants = [
      {
        id: 'assistant-with-default-model',
        source: 'user',
        name: 'Assistant With Default Model',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        agent_id: 'agent-claude',
        agent: {
          type: 'acp',
          source: 'builtin',
          acp_backend: 'claude',
        },
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: ['default'],
        agent_status: 'online',
        team_selectable: true,
        deletable: true,
      } satisfies Assistant,
    ];
    mockManagedAgents = [
      {
        id: 'agent-claude',
        backend: 'claude',
        available_models: {
          current_model_id: 'default',
          current_model_label: 'Default',
          available_models: [
            { id: 'default', label: 'Default' },
            { id: 'claude-opus', label: 'Claude Opus' },
            { id: 'claude-sonnet', label: 'Claude Sonnet' },
          ],
        },
      } as unknown as ManagedAgent,
    ];

    const { result } = renderHook(() =>
      useGuidAssistantSelection({
        resetAssistant: false,
      })
    );

    await waitFor(() => {
      expect(result.current.selectedAssistantId).toBe('assistant-with-default-model');
    });

    expect(result.current.currentAcpCachedModelInfo?.available_models.map((model) => model.id)).toEqual([
      'default',
      'claude-opus',
      'claude-sonnet',
    ]);
  });

  it('does not fall back to historical static modes when managed agent catalog has no modes', async () => {
    mockAssistants = [
      {
        id: 'assistant-claude-empty',
        source: 'generated',
        name: 'Claude',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        agent_id: 'agent-claude-empty',
        agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
        agent_status: 'online',
        team_selectable: true,
        deletable: false,
      } satisfies Assistant,
    ];
    mockManagedAgents = [{ id: 'agent-claude-empty', backend: 'claude' } as unknown as ManagedAgent];

    const { result } = renderHook(() =>
      useGuidAssistantSelection({
        resetAssistant: false,
      })
    );

    await waitFor(() => {
      expect(result.current.selectedAssistantId).toBe('assistant-claude-empty');
    });

    expect(result.current.currentAgentModeOptions).toEqual([]);
    expect(result.current.selectedMode).toBe('default');
  });

  it('reads aionrs mode options from the managed agent catalog', async () => {
    mockAssistants = [
      {
        id: 'bare:632f31d2',
        source: 'generated',
        name: 'Aion CLI',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        agent_id: '632f31d2',
        agent: { type: 'aionrs', source: 'internal' },
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
        agent_status: 'online',
        team_selectable: true,
        deletable: false,
      } satisfies Assistant,
    ];
    mockManagedAgents = [
      {
        id: '632f31d2',
        agent_type: 'aionrs',
        available_modes: {
          current_mode_id: 'default',
          available_modes: [
            { id: 'default', name: 'Default' },
            { id: 'auto_edit', name: 'Auto Edit' },
            { id: 'yolo', name: 'YOLO' },
          ],
        },
      } as unknown as ManagedAgent,
    ];

    const { result } = renderHook(() =>
      useGuidAssistantSelection({
        resetAssistant: false,
      })
    );

    await waitFor(() => {
      expect(result.current.selectedAssistantId).toBe('bare:632f31d2');
    });

    expect(result.current.selectedAssistantBackend).toBe('aionrs');
    expect(result.current.selectedMode).toBe('default');
    expect(result.current.currentAgentModeOptions.map((mode) => mode.value)).toEqual(['default', 'auto_edit', 'yolo']);
  });
});

describe('assistant model helpers', () => {
  it('builds model and mode info from agent runtime payloads', () => {
    const agent = {
      available_models: JSON.stringify({
        current_model_id: 'global.anthropic.claude-opus-4-8',
        current_model_label: 'Opus 4.8',
        available_models: [
          { id: 'default', label: 'Default' },
          { id: 'global.anthropic.claude-opus-4-8', label: 'Opus 4.8' },
        ],
      }),
      available_modes: JSON.stringify({
        current_mode_id: 'bypassPermissions',
        available_modes: [
          { id: 'default', name: 'Default' },
          { id: 'bypassPermissions', name: 'Bypass Permissions' },
        ],
      }),
    };

    expect(buildAgentRuntimeModelInfo(agent)).toEqual({
      current_model_id: 'global.anthropic.claude-opus-4-8',
      current_model_label: 'Opus 4.8',
      available_models: [
        { id: 'default', label: 'Default' },
        { id: 'global.anthropic.claude-opus-4-8', label: 'Opus 4.8' },
      ],
    });
    expect(buildAgentRuntimeModeState(agent)).toEqual({
      currentMode: 'bypassPermissions',
      options: [
        { value: 'default', label: 'Default', description: undefined },
        { value: 'bypassPermissions', label: 'Bypass Permissions', description: undefined },
      ],
    });
  });

  it('builds ACP model info from assistant models', () => {
    expect(buildAssistantModelInfo(['claude-opus', 'claude-sonnet'])).toEqual({
      current_model_id: 'claude-opus',
      current_model_label: 'claude-opus',
      available_models: [
        { id: 'claude-opus', label: 'claude-opus' },
        { id: 'claude-sonnet', label: 'claude-sonnet' },
      ],
    });
  });

  it('builds Codex ACP model info from assistant models', () => {
    expect(buildAssistantModelInfo(['gpt-5.5', 'gpt-5.4'])).toEqual({
      current_model_id: 'gpt-5.5',
      current_model_label: 'gpt-5.5',
      available_models: [
        { id: 'gpt-5.5', label: 'gpt-5.5' },
        { id: 'gpt-5.4', label: 'gpt-5.4' },
      ],
    });
  });

  it('defaults to the first assistant model when no assistant preference has been applied yet', () => {
    expect(resolveInitialAssistantModel(['claude-opus', 'claude-sonnet'])).toBe('claude-opus');
  });

  it('does not synthesize Codex models when the assistant catalog has none', () => {
    expect(buildAssistantModelInfo([])).toBeNull();
    expect(resolveInitialAssistantModel([])).toBeNull();
  });
});
