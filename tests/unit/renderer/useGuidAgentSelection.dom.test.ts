/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  buildAssistantModelInfo,
  resolveInitialAssistantModel,
  useGuidAssistantSelection,
} from '@/renderer/pages/guid/hooks/useGuidAssistantSelection';

vi.mock('@/renderer/pages/guid/hooks/useCustomAgentsLoader', () => ({
  useCustomAgentsLoader: () => ({
    assistants: [
      {
        id: 'assistant-claude',
        source: 'builtin',
        name: 'Claude Assistant',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        preset_agent_type: 'claude',
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
    ],
  }),
}));

describe('useGuidAssistantSelection', () => {
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
});

describe('assistant model helpers', () => {
  it('builds ACP model info from assistant models', () => {
    expect(buildAssistantModelInfo('claude', ['claude-opus', 'claude-sonnet'])).toEqual({
      current_model_id: 'claude-opus',
      current_model_label: 'claude-opus',
      available_models: [
        { id: 'claude-opus', label: 'claude-opus' },
        { id: 'claude-sonnet', label: 'claude-sonnet' },
      ],
    });
  });

  it('defaults to the first assistant model when no assistant preference has been applied yet', () => {
    expect(resolveInitialAssistantModel('claude', ['claude-opus', 'claude-sonnet'])).toBe('claude-opus');
  });
});
