/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAgentsMock, configGetMock, listProvidersMock } = vi.hoisted(() => ({
  getAgentsMock: vi.fn(),
  configGetMock: vi.fn(),
  listProvidersMock: vi.fn(),
}));

vi.mock('@/renderer/hooks/agent/useAgents', () => ({
  getAgents: getAgentsMock,
}));

vi.mock('@/common/config/configService', () => ({
  configService: { get: configGetMock },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: { listProviders: { invoke: listProvidersMock } },
  },
}));

import { buildCliAgentParams } from '@/renderer/pages/conversation/utils/createConversationParams';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';

const codebuddyAgent: AgentMetadata = {
  id: 'a1',
  name: 'CodeBuddy',
  agent_type: 'acp',
  agent_source: 'custom',
  backend: 'codebuddy',
};

describe('buildCliAgentParams preferred ACP model resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockReturnValue(undefined);
    getAgentsMock.mockResolvedValue([]);
  });

  it('strips /enabled suffix from a polluted saved preferredModelId (issue #3297)', async () => {
    configGetMock.mockImplementation((key: string) =>
      key === 'acp.config' ? { codebuddy: { preferredModelId: 'glm-5.1/enabled' } } : undefined
    );

    const params = await buildCliAgentParams(codebuddyAgent, '/tmp/workspace');

    expect(params.extra.current_model_id).toBe('glm-5.1');
  });

  it('strips suffix from the handshake fallback model id when no preference is saved', async () => {
    getAgentsMock.mockResolvedValue([
      {
        ...codebuddyAgent,
        handshake: {
          available_models: {
            current_model_id: 'kimi-k2.6/disabled',
            current_model_label: 'Kimi K2.6 (disabled)',
            available_models: [{ id: 'kimi-k2.6/disabled', label: 'Kimi K2.6 (disabled)' }],
          },
        },
      },
    ]);

    const params = await buildCliAgentParams(codebuddyAgent, '/tmp/workspace');

    expect(params.extra.current_model_id).toBe('kimi-k2.6');
  });

  it('keeps clean preferred model ids untouched', async () => {
    configGetMock.mockImplementation((key: string) =>
      key === 'acp.config' ? { codebuddy: { preferredModelId: 'glm-5.1' } } : undefined
    );

    const params = await buildCliAgentParams(codebuddyAgent, '/tmp/workspace');

    expect(params.extra.current_model_id).toBe('glm-5.1');
  });
});
