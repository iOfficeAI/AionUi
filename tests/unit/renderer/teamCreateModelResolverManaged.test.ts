/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/agent/useAgents', () => ({
  getAgents: vi.fn(),
}));

import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import { getAgents } from '@/renderer/hooks/agent/useAgents';
import { resolveDefaultTeamAgentModel } from '@/renderer/pages/team/components/teamCreateModelResolver';

describe('teamCreateModelResolver managed CLI mapping', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns managed runtime model ids for OpenCode-like targets', async () => {
    vi.mocked(ipcBridge.mode.listProviders.invoke).mockResolvedValue([
      {
        id: 'desktop-newapi-managed-provider',
        models: ['MiniMax-M2.7-highspeed', 'mimo-v2.5'],
        model_enabled: { 'MiniMax-M2.7-highspeed': true, 'mimo-v2.5': true },
      },
    ]);
    vi.mocked(configService.get).mockReturnValue({
      opencode: 'mimo-v2.5',
    });
    vi.mocked(getAgents).mockResolvedValue([]);

    const result = await resolveDefaultTeamAgentModel({ agent_type: 'opencode', conversation_type: 'acp' });
    expect(result).toBe('aionui-new-api-desktop-newapi-managed-provider/mimo-v2.5');
    expect(getAgents).not.toHaveBeenCalled();
  });
});
