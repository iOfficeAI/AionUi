import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useTeamList } from '@/renderer/pages/team/hooks/useTeamList';

const { getConversationOrNullMock, eventChannel } = vi.hoisted(() => ({
  getConversationOrNullMock: vi.fn(),
  eventChannel: { on: vi.fn(() => () => {}) },
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      removeJob: { invoke: vi.fn() },
    },
    team: {
      list: { invoke: vi.fn() },
      remove: { invoke: vi.fn() },
      listChanged: eventChannel,
      created: eventChannel,
      removed: eventChannel,
      renamed: eventChannel,
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: (...args: unknown[]) => getConversationOrNullMock(...args),
}));

import { ipcBridge } from '@/common';

describe('useTeamList cron cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(ipcBridge.team.list.invoke).mockResolvedValue([team()]);
    vi.mocked(ipcBridge.team.remove.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcBridge.cron.removeJob.invoke).mockResolvedValue(undefined);
  });

  it('removes leader and member cron jobs before removing a team', async () => {
    getConversationOrNullMock.mockImplementation(async (conversationId: string) => {
      if (conversationId === 'leader-conv')
        return conversation({ id: conversationId, extra: { cron_job_id: 'cron-leader' } });
      if (conversationId === 'member-conv')
        return conversation({ id: conversationId, extra: { cronJobId: 'cron-member' } });
      return null;
    });
    localStorage.setItem('team-active-slot-team-1', 'member-slot');

    const { result } = renderHook(() => useTeamList(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.teams).toHaveLength(1));

    await act(async () => {
      await result.current.removeTeam('team-1');
    });

    expect(ipcBridge.cron.removeJob.invoke).toHaveBeenCalledWith({ job_id: 'cron-leader' });
    expect(ipcBridge.cron.removeJob.invoke).toHaveBeenCalledWith({ job_id: 'cron-member' });
    expect(ipcBridge.team.remove.invoke).toHaveBeenCalledWith({ id: 'team-1' });
    expect(vi.mocked(ipcBridge.cron.removeJob.invoke).mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(ipcBridge.team.remove.invoke).mock.invocationCallOrder[0]
    );
    expect(localStorage.getItem('team-active-slot-team-1')).toBeNull();
  });
});

function swrWrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>;
}

function conversation(overrides?: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'conv-1',
    type: 'acp',
    name: 'Team conversation',
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
        slot_id: 'leader-slot',
        conversation_id: 'leader-conv',
        role: 'leader',
        assistant_backend: 'codex',
        assistant_name: 'Leader',
        status: 'idle',
      },
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
