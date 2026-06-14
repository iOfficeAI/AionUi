/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAgentsMock, configGetMock } = vi.hoisted(() => ({
  getAgentsMock: vi.fn(),
  configGetMock: vi.fn(),
}));

vi.mock('@/renderer/hooks/agent/useAgents', () => ({
  getAgents: getAgentsMock,
}));

vi.mock('@/common/config/configService', () => ({
  configService: { get: configGetMock },
}));

import { resolveDefaultTeamAgentModel } from '@/renderer/pages/team/components/teamCreateModelResolver';

describe('resolveDefaultTeamAgentModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockReturnValue(undefined);
  });

  it('resolves the handshake current_model_id for ACP backends', async () => {
    getAgentsMock.mockResolvedValue([
      {
        id: 'a1',
        agent_type: 'acp',
        backend: 'claude',
        handshake: {
          available_models: {
            current_model_id: 'claude-sonnet-4-5',
            current_model_label: 'Claude Sonnet 4.5',
            available_models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
          },
        },
      },
    ]);

    await expect(resolveDefaultTeamAgentModel({ agent_type: 'claude', conversation_type: 'acp' })).resolves.toBe(
      'claude-sonnet-4-5'
    );
  });

  it('strips /enabled suffix from the handshake model id (issue #3297)', async () => {
    getAgentsMock.mockResolvedValue([
      {
        id: 'a1',
        agent_type: 'acp',
        backend: 'codebuddy',
        handshake: {
          available_models: {
            current_model_id: 'glm-5.1/enabled',
            current_model_label: 'GLM-5.1 (enabled)',
            available_models: [{ id: 'glm-5.1/enabled', label: 'GLM-5.1 (enabled)' }],
          },
        },
      },
    ]);

    await expect(resolveDefaultTeamAgentModel({ agent_type: 'codebuddy', conversation_type: 'acp' })).resolves.toBe(
      'glm-5.1'
    );
  });

  it('falls back to "default" when no handshake data exists', async () => {
    getAgentsMock.mockResolvedValue([]);

    await expect(resolveDefaultTeamAgentModel({ agent_type: 'codex', conversation_type: 'acp' })).resolves.toBe(
      'default'
    );
  });
});
