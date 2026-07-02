import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/team/teamTypes';
import {
  removeTeamAssistantWithCronCleanup,
  removeTeamWithCronCleanup,
} from '@/renderer/pages/team/utils/removeTeamAssistantWithCronCleanup';

describe('removeTeamAssistantWithCronCleanup', () => {
  it('removes the member cron job before removing the team member', async () => {
    const calls: string[] = [];
    const getConversation = vi.fn(async () => conversation({ extra: { cron_job_id: 'cron-1' } }));
    const removeCronJob = vi.fn(async () => {
      calls.push('cron');
    });
    const removeAgent = vi.fn(async () => {
      calls.push('team');
    });

    await removeTeamAssistantWithCronCleanup({
      team: team(),
      slot_id: 'member-slot',
      getConversation,
      removeCronJob,
      removeAgent,
    });

    expect(getConversation).toHaveBeenCalledWith('member-conv');
    expect(removeCronJob).toHaveBeenCalledWith('cron-1');
    expect(removeAgent).toHaveBeenCalledWith({ team_id: 'team-1', slot_id: 'member-slot' });
    expect(calls).toEqual(['cron', 'team']);
  });

  it('removes the team member directly when the member conversation has no cron job', async () => {
    const getConversation = vi.fn(async () => conversation({ extra: { team_id: 'team-1' } }));
    const removeCronJob = vi.fn();
    const removeAgent = vi.fn();

    await removeTeamAssistantWithCronCleanup({
      team: team(),
      slot_id: 'member-slot',
      getConversation,
      removeCronJob,
      removeAgent,
    });

    expect(removeCronJob).not.toHaveBeenCalled();
    expect(removeAgent).toHaveBeenCalledWith({ team_id: 'team-1', slot_id: 'member-slot' });
  });

  it('removes leader and member cron jobs before removing the team', async () => {
    const calls: string[] = [];
    const getConversation = vi.fn(async (conversation_id: string) => {
      if (conversation_id === 'leader-conv')
        return conversation({ id: conversation_id, extra: { cron_job_id: 'cron-leader' } });
      if (conversation_id === 'member-conv')
        return conversation({ id: conversation_id, extra: { cronJobId: 'cron-member' } });
      return null;
    });
    const removeCronJob = vi.fn(async (job_id: string) => {
      calls.push(`cron:${job_id}`);
    });
    const removeTeam = vi.fn(async () => {
      calls.push('team');
    });

    await removeTeamWithCronCleanup({
      team: team(),
      getConversation,
      removeCronJob,
      removeTeam,
    });

    expect(getConversation).toHaveBeenCalledWith('leader-conv');
    expect(getConversation).toHaveBeenCalledWith('member-conv');
    expect(removeCronJob).toHaveBeenCalledWith('cron-leader');
    expect(removeCronJob).toHaveBeenCalledWith('cron-member');
    expect(removeTeam).toHaveBeenCalledWith({ id: 'team-1' });
    expect(calls).toEqual(['cron:cron-leader', 'cron:cron-member', 'team']);
  });

  it('deduplicates cron jobs before removing the team', async () => {
    const getConversation = vi.fn(async () => conversation({ extra: { cron_job_id: 'cron-shared' } }));
    const removeCronJob = vi.fn();
    const removeTeam = vi.fn();

    await removeTeamWithCronCleanup({
      team: team(),
      getConversation,
      removeCronJob,
      removeTeam,
    });

    expect(removeCronJob).toHaveBeenCalledTimes(1);
    expect(removeCronJob).toHaveBeenCalledWith('cron-shared');
    expect(removeTeam).toHaveBeenCalledWith({ id: 'team-1' });
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
