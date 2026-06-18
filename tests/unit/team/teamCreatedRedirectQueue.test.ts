/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { TTeam } from '@/common/types/team/teamTypes';
import {
  deferLeaderQueueBeforeTeamRedirect,
  getLeaderConversationIdFromTeam,
} from '@/renderer/pages/team/hooks/teamCreatedRedirectQueue';

const createTeam = (overrides: Partial<TTeam> = {}): TTeam => ({
  id: 'team-1',
  user_id: 'user-1',
  name: 'Dev Team',
  workspace: '/tmp/workspace',
  workspace_mode: 'shared',
  leader_agent_id: 'leader-slot',
  agents: [
    {
      slot_id: 'leader-slot',
      conversation_id: 'conv-leader',
      role: 'leader',
      agent_type: 'codex',
      agent_name: 'Leader',
      conversation_type: 'acp',
      status: 'idle',
    },
    {
      slot_id: 'teammate-slot',
      conversation_id: 'conv-worker',
      role: 'teammate',
      agent_type: 'claude',
      agent_name: 'Worker',
      conversation_type: 'acp',
      status: 'idle',
    },
  ],
  created_at: 1,
  updated_at: 1,
  ...overrides,
});

describe('getLeaderConversationIdFromTeam', () => {
  it('returns the agent whose slot_id matches leader_agent_id', () => {
    expect(getLeaderConversationIdFromTeam(createTeam())).toBe('conv-leader');
  });

  it('falls back to the first leader role agent when leader_agent_id does not match', () => {
    expect(
      getLeaderConversationIdFromTeam(
        createTeam({
          leader_agent_id: 'missing-slot',
        })
      )
    ).toBe('conv-leader');
  });

  it('returns null for null, missing agents, or empty conversation ids', () => {
    expect(getLeaderConversationIdFromTeam(null)).toBeNull();
    expect(getLeaderConversationIdFromTeam(createTeam({ agents: [] }))).toBeNull();
    expect(
      getLeaderConversationIdFromTeam(
        createTeam({
          agents: [
            {
              slot_id: 'leader-slot',
              conversation_id: '   ',
              role: 'leader',
              agent_type: 'codex',
              agent_name: 'Leader',
              conversation_type: 'acp',
              status: 'idle',
            },
          ],
        })
      )
    ).toBeNull();
  });
});

describe('deferLeaderQueueBeforeTeamRedirect', () => {
  it('loads the team, emits a queue defer for the leader conversation, and returns true', async () => {
    const getTeam = vi.fn().mockResolvedValue(createTeam());
    const emitDefer = vi.fn();

    await expect(
      deferLeaderQueueBeforeTeamRedirect({
        team_id: 'team-1',
        getTeam,
        emitDefer,
      })
    ).resolves.toBe(true);

    expect(getTeam).toHaveBeenCalledExactlyOnceWith({ id: 'team-1' });
    expect(emitDefer).toHaveBeenCalledExactlyOnceWith({
      conversation_id: 'conv-leader',
      team_id: 'team-1',
    });
  });

  it('returns false without emitting when getTeam fails or no leader conversation is available', async () => {
    const emitDefer = vi.fn();

    await expect(
      deferLeaderQueueBeforeTeamRedirect({
        team_id: 'team-1',
        getTeam: vi.fn().mockRejectedValue(new Error('network failed')),
        emitDefer,
      })
    ).resolves.toBe(false);
    expect(emitDefer).not.toHaveBeenCalled();

    await expect(
      deferLeaderQueueBeforeTeamRedirect({
        team_id: 'team-1',
        getTeam: vi.fn().mockResolvedValue(createTeam({ agents: [] })),
        emitDefer,
      })
    ).resolves.toBe(false);
    expect(emitDefer).not.toHaveBeenCalled();
  });
});
