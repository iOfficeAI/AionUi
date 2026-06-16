/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  buildAssistantModelInfo,
  resolveInitialAssistantModel,
  useGuidAgentSelection,
} from '@/renderer/pages/guid/hooks/useGuidAgentSelection';

const configGetMock = vi.fn();

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (...args: unknown[]) => configGetMock(...args),
    set: vi.fn(() => Promise.resolve()),
  },
}));

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
        agent_status: 'available',
        team_selectable: true,
        deletable: false,
      } satisfies Assistant,
    ],
  }),
}));

describe('useGuidAgentSelection', () => {
  beforeEach(() => {
    configGetMock.mockReset();
    configGetMock.mockImplementation((key: string) => {
      if (key === 'guid.lastSelectedAgent') {
        return 'assistant-claude';
      }
      if (key === 'acp.config') {
        return {
          claude: {
            preferredModelId: 'claude-sonnet',
          },
        };
      }
      return undefined;
    });
  });

  it('derives availability and model info from assistant catalog data', async () => {
    const { result } = renderHook(() =>
      useGuidAgentSelection({
        resetAssistant: false,
      })
    );

    await waitFor(() => {
      expect(result.current.selectedAssistantId).toBe('assistant-claude');
    });

    expect(result.current.selectedAssistantAvailable).toBe(true);
    expect(result.current.selectedAcpModel).toBe('claude-sonnet');
    expect(result.current.currentAcpCachedModelInfo).toEqual({
      current_model_id: 'claude-opus',
      current_model_label: 'claude-opus',
      available_models: [
        { id: 'claude-opus', label: 'claude-opus' },
        { id: 'claude-sonnet', label: 'claude-sonnet' },
      ],
    });
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

  it('prefers configured model ids when they exist in the assistant model list', () => {
    expect(resolveInitialAssistantModel('claude', ['claude-opus', 'claude-sonnet'], 'claude-sonnet')).toBe(
      'claude-sonnet'
    );
    expect(resolveInitialAssistantModel('claude', ['claude-opus', 'claude-sonnet'], 'missing')).toBe('claude-opus');
  });
});
