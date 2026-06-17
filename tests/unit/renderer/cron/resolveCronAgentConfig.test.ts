/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { resolveCronAgentConfig } from '@/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig';

describe('resolveCronAgentConfig', () => {
  it('stores provider id for preset aionrs assistants instead of literal aionrs backend', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-1',
      presetAssistants: [
        assistant({
          id: 'assistant-1',
          name: '文件规划助手',
          preset_agent_type: 'aionrs',
        }),
      ],
      selectedAionrsProvider: {
        id: 'provider-gemini',
        name: 'Gemini',
      },
      model_id: 'gemini-3.1-pro-preview',
      workspace: '/tmp/project',
      getMode: () => 'yolo',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      agent_config: {
        backend: 'provider-gemini',
        name: '文件规划助手',
        assistant_id: 'assistant-1',
        mode: 'yolo',
        model_id: 'gemini-3.1-pro-preview',
        workspace: '/tmp/project',
      },
    });
  });

  it('keeps preset acp assistants on their backend slug', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-2',
      presetAssistants: [
        assistant({
          id: 'assistant-2',
          name: 'Codex 助手',
          preset_agent_type: 'codex',
        }),
      ],
      config_options: { reasoning_effort: 'high' },
      getMode: (backend) => (backend === 'codex' ? 'full-access' : 'yolo'),
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      agent_config: {
        name: 'Codex 助手',
        assistant_id: 'assistant-2',
        mode: 'full-access',
        config_options: { reasoning_effort: 'high' },
        model_id: undefined,
        workspace: undefined,
      },
    });
  });

  it('omits backend for non-aionrs assistants and lets the backend derive runtime identity', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-4',
      presetAssistants: [
        assistant({
          id: 'assistant-4',
          name: 'Claude 助手',
          preset_agent_type: 'claude',
        }),
      ],
      getMode: () => 'default',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      agent_config: {
        name: 'Claude 助手',
        assistant_id: 'assistant-4',
        mode: 'default',
        model_id: undefined,
        config_options: undefined,
        workspace: undefined,
      },
    });
    expect(result.agent_config).not.toHaveProperty('backend');
  });

  it('does not write legacy custom_agent_id for new preset cron jobs', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-3',
      presetAssistants: [
        assistant({
          id: 'assistant-3',
          name: '社媒发布助手',
          preset_agent_type: 'claude',
        }),
      ],
      getMode: () => 'default',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result.agent_config).toBeDefined();
    expect(result.agent_config).not.toHaveProperty('custom_agent_id');
    expect(result.agent_config).not.toHaveProperty('preset_agent_type');
    expect(result.agent_config).not.toHaveProperty('is_preset');
  });

  it('throws when the selected assistant cannot be resolved', () => {
    expect(() =>
      resolveCronAgentConfig({
        agentValue: 'missing-assistant',
        presetAssistants: [],
        getMode: () => 'default',
        aionrsModelRequiredMessage: 'provider required',
      })
    ).toThrowError('assistant_id is required');
  });
});

function assistant(overrides: Pick<Assistant, 'id' | 'name' | 'preset_agent_type'>): Assistant {
  return {
    id: overrides.id,
    source: 'user',
    name: overrides.name,
    name_i18n: {},
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
    models: [],
  };
}
