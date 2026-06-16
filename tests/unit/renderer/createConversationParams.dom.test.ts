/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { buildPresetAssistantParams } from '@/renderer/pages/conversation/utils/createConversationParams';

const configGetMock = vi.fn();
const getAgentsMock = vi.fn();

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (...args: unknown[]) => configGetMock(...args),
  },
}));

vi.mock('@/renderer/hooks/agent/useAgents', () => ({
  getAgents: (...args: unknown[]) => getAgentsMock(...args),
}));

describe('buildPresetAssistantParams', () => {
  beforeEach(() => {
    configGetMock.mockReset();
    getAgentsMock.mockReset();
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return {};
      }
      return undefined;
    });
  });

  it('uses assistant model metadata before falling back to /api/agents', async () => {
    getAgentsMock.mockRejectedValue(new Error('should not be called for preset assistants'));

    const payload = await buildPresetAssistantParams(
      assistant({
        preset_agent_type: 'claude',
        models: ['claude-sonnet-4', 'claude-opus-4'],
      }),
      '/workspace',
      'zh-CN'
    );

    expect(payload.assistant?.conversation_overrides?.model).toBe('claude-sonnet-4');
    expect(payload.extra.current_model_id).toBe('claude-sonnet-4');
    expect(getAgentsMock).not.toHaveBeenCalled();
  });

  it('prefers saved model ids when they still exist in the assistant catalog row', async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return {
          claude: {
            preferredModelId: 'claude-opus-4',
          },
        };
      }
      return undefined;
    });
    getAgentsMock.mockRejectedValue(new Error('should not be called for preset assistants'));

    const payload = await buildPresetAssistantParams(
      assistant({
        preset_agent_type: 'claude',
        models: ['claude-sonnet-4', 'claude-opus-4'],
      }),
      '/workspace',
      'zh-CN'
    );

    expect(payload.assistant?.conversation_overrides?.model).toBe('claude-opus-4');
    expect(payload.extra.current_model_id).toBe('claude-opus-4');
    expect(getAgentsMock).not.toHaveBeenCalled();
  });
});

function assistant(overrides: Partial<Assistant> & Pick<Assistant, 'preset_agent_type' | 'models'>): Assistant {
  return {
    id: 'assistant-1',
    source: 'builtin',
    name: 'Assistant',
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 1,
    preset_agent_type: overrides.preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: overrides.models,
    agent_status: 'available',
    team_selectable: true,
    deletable: false,
    ...overrides,
  };
}
