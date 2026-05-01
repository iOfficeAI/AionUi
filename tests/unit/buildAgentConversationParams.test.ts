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

  it('builds native Codex params when the selected detected agent kind is codex', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      agentKind: 'codex',
      name: 'Native Codex',
      workspace: '/workspace',
      model: {} as never,
      cliPath: '/usr/local/bin/codex',
      sessionMode: 'default',
    });

    expect(params).toEqual({
      type: 'codex',
      name: 'Native Codex',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        cliPath: '/usr/local/bin/codex',
        sessionMode: 'default',
        codexNative: true,
      }),
    });
  });

  it('keeps ACP Codex fallback routeable when the selected detected agent kind is acp', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      agentKind: 'acp',
      name: 'ACP Codex',
      workspace: '/workspace',
      model: {} as never,
      cliPath: '/usr/local/bin/codex-acp',
    });

    expect(params).toEqual({
      type: 'acp',
      name: 'ACP Codex',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        backend: 'codex',
        cliPath: '/usr/local/bin/codex-acp',
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

  it('builds native Codex preset params when the preset target resolves to a native Codex agent', () => {
    const params = buildAgentConversationParams({
      backend: 'custom',
      agentKind: 'codex',
      name: 'Preset Codex',
      agentName: 'Preset Codex',
      workspace: '/workspace',
      model: {} as never,
      cliPath: '/usr/local/bin/codex',
      customAgentId: 'assistant-codex',
      isPreset: true,
      presetAgentType: 'codex',
      presetResources: {
        rules: 'CODEX PRESET RULES',
        enabledSkills: ['skill-a'],
      },
    });

    expect(params).toEqual({
      type: 'codex',
      name: 'Preset Codex',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        codexNative: true,
        cliPath: '/usr/local/bin/codex',
        presetAssistantId: 'assistant-codex',
        presetContext: 'CODEX PRESET RULES',
        enabledSkills: ['skill-a'],
      }),
    });
    expect(params.extra.backend).toBeUndefined();
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
