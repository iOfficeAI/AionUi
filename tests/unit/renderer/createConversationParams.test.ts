/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listProvidersInvoke, configGetMock, getAgentsMock } = vi.hoisted(() => ({
  listProvidersInvoke: vi.fn(),
  configGetMock: vi.fn(() => undefined),
  getAgentsMock: vi.fn(async () => []),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: listProvidersInvoke },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
  },
}));

vi.mock('@/common/utils/presetAssistantResources', () => ({
  loadPresetAssistantResources: vi.fn(),
}));

vi.mock('@/renderer/utils/model/agentModes', () => ({
  getAgentModes: vi.fn(() => []),
}));

vi.mock('@/renderer/hooks/agent/useAgents', () => ({
  getAgents: getAgentsMock,
}));

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { loadPresetAssistantResources } from '@/common/utils/presetAssistantResources';
import {
  buildCliAgentParams,
  buildPresetAssistantParams,
} from '@/renderer/pages/conversation/utils/createConversationParams';

describe('createConversationParams managed ACP runtime mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockReturnValue(undefined);
    listProvidersInvoke.mockResolvedValue([]);
    getAgentsMock.mockResolvedValue([]);
  });

  it('writes builtin preset enabled_skills into preset_enabled_skills extra', async () => {
    const assistant: Assistant = {
      id: 'ozon-assistants',
      source: 'builtin',
      name: 'Ozon Assistants',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 1,
      preset_agent_type: 'aionrs',
      enabled_skills: ['pounding-ozon'],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    };

    vi.mocked(loadPresetAssistantResources).mockResolvedValue({
      rules: 'preset ozon rules',
      skills: 'preset skill body',
      enabled_skills: ['pounding-ozon'],
      exclude_auto_inject_skills: undefined,
    });

    const params = await buildPresetAssistantParams(assistant, '/tmp/workspace', 'zh-CN');

    expect(params.type).toBe('aionrs');
    expect(params.extra?.backend).toBe('aionrs');
    expect(params.extra?.preset_assistant_id).toBe('ozon-assistants');
    expect(params.extra?.preset_context).toBe('preset ozon rules');
    expect(params.extra?.preset_enabled_skills).toEqual(['pounding-ozon']);
  });

  it('omits preset_enabled_skills when preset resources return no enabled skills', async () => {
    const assistant: Assistant = {
      id: 'plain-assistant',
      source: 'builtin',
      name: 'Plain Assistant',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 1,
      preset_agent_type: 'aionrs',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    };

    vi.mocked(loadPresetAssistantResources).mockResolvedValue({
      rules: 'plain rules',
      skills: '',
      enabled_skills: undefined,
      exclude_auto_inject_skills: undefined,
    });

    const params = await buildPresetAssistantParams(assistant, '/tmp/workspace', 'zh-CN');

    expect(params.extra?.preset_enabled_skills).toBeUndefined();
    expect(params.extra?.preset_context).toBe('plain rules');
  });

  it('normalizes managed Claude handshake fallback to slot runtime id', async () => {
    getAgentsMock.mockResolvedValue([
      {
        backend: 'claude',
        agent_type: 'acp',
        handshake: {
          available_models: {
            current_model_id: 'MiniMax-M2.7-highspeed',
            current_model_label: 'MiniMax-M2.7-highspeed',
            available_models: [{ id: 'MiniMax-M2.7-highspeed', label: 'MiniMax-M2.7-highspeed' }],
          },
        },
      },
    ]);

    const params = await buildCliAgentParams(
      {
        id: 'claude-row',
        name: 'Claude Code',
        backend: 'claude',
        agent_type: 'acp',
      } as never,
      '/tmp/workspace'
    );

    expect(params.type).toBe('acp');
    expect(params.extra?.current_model_id).toBe('default');
  });
});
