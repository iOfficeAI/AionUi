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
      agentName: 'Qwen Code',
      workspace: '/workspace',
      model: {} as any,
      cliPath: '/usr/local/bin/qwen',
      currentModelId: 'qwen3-coder-plus',
      sessionMode: 'yolo',
      extra: {
        teamId: 'team-1',
      },
    });

    expect(params).toEqual({
      type: 'acp',
      name: 'Conversation Name',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        backend: 'qwen',
        agentName: 'Qwen Code',
        cliPath: '/usr/local/bin/qwen',
        currentModelId: 'qwen3-coder-plus',
        sessionMode: 'yolo',
        teamId: 'team-1',
      }),
    });
  });

  it('builds preset gemini params with rules and enabled skills', () => {
    const params = buildAgentConversationParams({
      backend: 'gemini',
      name: 'Preset Gemini',
      agentName: 'Preset Gemini',
      workspace: '/workspace',
      model: { id: 'provider-1', useModel: 'gemini-2.0-flash' } as any,
      customAgentId: 'assistant-1',
      isPreset: true,
      presetAgentType: 'gemini',
      presetResources: {
        rules: 'PRESET RULES',
        enabledSkills: ['skill-a'],
      },
    });

    expect(params).toEqual({
      type: 'gemini',
      name: 'Preset Gemini',
      model: { id: 'provider-1', useModel: 'gemini-2.0-flash' },
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        presetAssistantId: 'assistant-1',
        presetRules: 'PRESET RULES',
        enabledSkills: ['skill-a'],
      }),
    });
  });

  it('builds remote params with remote agent id', () => {
    const params = buildAgentConversationParams({
      backend: 'remote',
      name: 'Remote Conversation',
      workspace: '/workspace',
      model: {} as any,
      customAgentId: 'remote-agent-id',
    });

    expect(params).toEqual({
      type: 'remote',
      name: 'Remote Conversation',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        remoteAgentId: 'remote-agent-id',
      }),
    });
  });
});
