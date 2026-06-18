import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useSiderTeamBadges } from '@/renderer/pages/team/hooks/useSiderTeamBadges';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      confirmation: {
        list: { invoke: vi.fn() },
        add: { on: vi.fn() },
        remove: { on: vi.fn() },
      },
    },
  },
}));

const team = {
  id: 'team-1',
  user_id: 'user-1',
  name: 'Alpha',
  workspace: '/tmp/workspace',
  workspace_mode: 'shared',
  leader_assistant_id: 'slot-1',
  leader_agent_id: 'slot-1',
  session_mode: undefined,
  created_at: 1,
  updated_at: 1,
  assistants: [
    {
      slot_id: 'slot-1',
      conversation_id: 'conv-1',
      role: 'leader',
      assistant_backend: 'claude',
      assistant_name: 'Lead',
      status: 'idle',
      pending_confirmations: 2,
    },
    {
      slot_id: 'slot-2',
      conversation_id: 'conv-2',
      role: 'teammate',
      assistant_backend: 'claude',
      assistant_name: 'Worker',
      status: 'idle',
      pending_confirmations: 1,
    },
  ],
  agents: [],
} as TTeam;

describe('useSiderTeamBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipcBridge.conversation.confirmation.add.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.conversation.confirmation.remove.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.conversation.confirmation.list.invoke).mockResolvedValue([]);
  });

  it('uses backend-provided pending counts without listing every conversation confirmation', async () => {
    const { result } = renderHook(() => useSiderTeamBadges([team]));

    expect(result.current.get('team-1')).toBe(3);
    await waitFor(() => {
      expect(ipcBridge.conversation.confirmation.add.on).toHaveBeenCalled();
      expect(ipcBridge.conversation.confirmation.remove.on).toHaveBeenCalled();
    });
    expect(ipcBridge.conversation.confirmation.list.invoke).not.toHaveBeenCalled();
  });
});
