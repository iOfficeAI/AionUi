import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useTeamSession } from '@/renderer/pages/team/hooks/useTeamSession';

const { getConversationOrNullMock, eventChannel } = vi.hoisted(() => ({
  getConversationOrNullMock: vi.fn(),
  eventChannel: { on: vi.fn(() => () => {}) },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      removeJob: { invoke: vi.fn() },
    },
    team: {
      get: { invoke: vi.fn() },
      addAgent: { invoke: vi.fn() },
      renameAgent: { invoke: vi.fn() },
      removeAgent: { invoke: vi.fn() },
      agentStatusChanged: eventChannel,
      agentSpawned: eventChannel,
      agentRemoved: eventChannel,
      agentRenamed: eventChannel,
      mcpStatus: eventChannel,
      taskChanged: eventChannel,
      sessionChanged: eventChannel,
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: (...args: unknown[]) => getConversationOrNullMock(...args),
}));

import { ipcBridge } from '@/common';

describe('useTeamSession cron cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipcBridge.team.get.invoke).mockResolvedValue(team());
    vi.mocked(ipcBridge.team.removeAgent.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcBridge.cron.removeJob.invoke).mockResolvedValue(undefined);
  });

  it('removes a member cron job before removing the member through the session hook', async () => {
    getConversationOrNullMock.mockResolvedValue(conversation({ extra: { cron_job_id: 'cron-member' } }));

    const { result } = renderHook(() => useTeamSession(team()));

    await act(async () => {
      await result.current.removeAssistant('member-slot');
    });

    expect(getConversationOrNullMock).toHaveBeenCalledWith('member-conv');
    expect(ipcBridge.cron.removeJob.invoke).toHaveBeenCalledWith({ job_id: 'cron-member' });
    expect(ipcBridge.team.removeAgent.invoke).toHaveBeenCalledWith({ team_id: 'team-1', slot_id: 'member-slot' });
    expect(vi.mocked(ipcBridge.cron.removeJob.invoke).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ipcBridge.team.removeAgent.invoke).mock.invocationCallOrder[0]
    );
  });
});

function conversation(overrides?: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'member-conv',
    type: 'acp',
    name: 'Member',
    created_at: 1,
    updated_at: 1,
    extra: {},
    ...overrides,
  } as TChatConversation;
}

function team(): TTeam {
  return {
    id: 'team-1',
    user_id: 'user-1',
    name: 'Cron Team',
    workspace: '/tmp/team',
    workspace_mode: 'shared',
    leader_assistant_id: 'leader-assistant',
    created_at: 1,
    updated_at: 1,
    assistants: [
      {
        slot_id: 'member-slot',
        conversation_id: 'member-conv',
        role: 'teammate',
        assistant_backend: 'codex',
        assistant_name: 'Member',
        status: 'idle',
      },
    ],
  };
}
