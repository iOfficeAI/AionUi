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
    configGetMock.mockReturnValue(undefined);
  });

  it('uses assistant model metadata without consulting agent preference storage', async () => {
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
    expect(configGetMock).not.toHaveBeenCalled();
  });

  it('ignores legacy saved model ids and always uses assistant-owned model metadata', async () => {
    configGetMock.mockImplementation(() => ({
      claude: {
        preferredModelId: 'claude-opus-4',
      },
    }));
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
    expect(configGetMock).not.toHaveBeenCalled();
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
