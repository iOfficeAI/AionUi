/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildAgentConversationParams } from '../../src/common/utils/buildAgentConversationParams';

describe('buildAgentConversationParams', () => {
  it('builds ACP params for regular backends', () => {
    const params = buildAgentConversationParams({
      backend: 'qwen',
      name: 'Conversation Name',
      agent_name: 'Qwen Code',
      workspace: '/workspace',
      model: {} as any,
      cli_path: '/usr/local/bin/qwen',
      current_model_id: 'qwen3-coder-plus',
      session_mode: 'yolo',
      extra: {
        team_id: 'team-1',
      },
    });

    expect(params).toEqual({
      type: 'acp',
      name: 'Conversation Name',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        custom_workspace: true,
        backend: 'qwen',
        agent_name: 'Qwen Code',
        cli_path: '/usr/local/bin/qwen',
        current_model_id: 'qwen3-coder-plus',
        session_mode: 'yolo',
        team_id: 'team-1',
      }),
    });
  });

  it('builds preset gemini params with rules and enabled skills', () => {
    const params = buildAgentConversationParams({
      backend: 'gemini',
      name: 'Preset Gemini',
      agent_name: 'Preset Gemini',
      workspace: '/workspace',
      model: { id: 'provider-1', use_model: 'gemini-2.0-flash' } as any,
      custom_agent_id: 'assistant-1',
      is_preset: true,
      presetAgentType: 'gemini',
      presetResources: {
        rules: 'PRESET RULES',
        enabled_skills: ['skill-a'],
      },
    });

    expect(params).toEqual({
      type: 'gemini',
      name: 'Preset Gemini',
      model: { id: 'provider-1', use_model: 'gemini-2.0-flash' },
      extra: expect.objectContaining({
        workspace: '/workspace',
        custom_workspace: true,
        preset_assistant_id: 'assistant-1',
        preset_rules: 'PRESET RULES',
        enabled_skills: ['skill-a'],
      }),
    });
  });

  it('builds remote params with remote agent id', () => {
    const params = buildAgentConversationParams({
      backend: 'remote',
      name: 'Remote Conversation',
      workspace: '/workspace',
      model: {} as any,
      custom_agent_id: 'remote-agent-id',
    });

    expect(params).toEqual({
      type: 'remote',
      name: 'Remote Conversation',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        custom_workspace: true,
        remoteAgentId: 'remote-agent-id',
      }),
    });
  });
});
