/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAssistantMock = vi.fn();
const configGetMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      get: {
        invoke: (...args: unknown[]) => getAssistantMock(...args),
      },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (...args: unknown[]) => configGetMock(...args),
  },
}));

import { resolveDefaultTeamAgentModel } from '@/renderer/pages/team/components/teamCreateModelResolver';

describe('resolveDefaultTeamAgentModel', () => {
  beforeEach(() => {
    getAssistantMock.mockReset();
    configGetMock.mockReset();
  });

  it('prefers the assistant fixed default model over agent-level fallbacks', async () => {
    getAssistantMock.mockResolvedValue({
      defaults: {
        model: { mode: 'fixed', value: 'claude-sonnet-4-5-20250514' },
      },
      preferences: {
        last_model_id: 'claude-opus-4-1-20250805',
      },
    });

    await expect(
      resolveDefaultTeamAgentModel({
        assistant_id: 'assistant-fixed',
        agent_type: 'claude',
        conversation_type: 'acp',
      })
    ).resolves.toBe('claude-sonnet-4-5-20250514');
  });

  it('uses the assistant remembered auto model before falling back to global agent defaults', async () => {
    getAssistantMock.mockResolvedValue({
      defaults: {
        model: { mode: 'auto' },
      },
      preferences: {
        last_model_id: 'gemini-2.5-pro',
      },
    });
    configGetMock.mockReturnValue({
      use_model: 'gpt-5',
    });

    await expect(
      resolveDefaultTeamAgentModel({
        assistant_id: 'assistant-auto',
        agent_type: 'aionrs',
        conversation_type: 'aionrs',
      })
    ).resolves.toBe('gemini-2.5-pro');
  });
});
