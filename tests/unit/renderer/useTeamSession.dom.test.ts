/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the 404 idempotent-delete path in
 * renderer/pages/team/hooks/useTeamSession.ts (issue #3237).
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useTeamSession } from '@/renderer/pages/team/hooks/useTeamSession';

const { mutateTeamMock } = vi.hoisted(() => ({
  mutateTeamMock: vi.fn(),
}));

const unsubscribe = () => {};

vi.mock('swr', () => ({
  default: vi.fn(() => ({ mutate: mutateTeamMock })),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      get: { invoke: vi.fn() },
      removeAgent: { invoke: vi.fn() },
      agentStatusChanged: { on: vi.fn(() => unsubscribe) },
      agentSpawned: { on: vi.fn(() => unsubscribe) },
      agentRemoved: { on: vi.fn(() => unsubscribe) },
      agentRenamed: { on: vi.fn(() => unsubscribe) },
    },
  },
}));

const team = {
  id: 'team-1',
  user_id: 'user-1',
  name: 'Alpha',
  workspace: '/tmp/workspace',
  workspace_mode: 'shared',
  leader_agent_id: 'slot-1',
  created_at: 1,
  updated_at: 1,
  agents: [
    {
      slot_id: 'slot-1',
      conversation_id: 'conv-1',
      role: 'leader',
      agent_type: 'acp',
      agent_name: 'Lead',
      conversation_type: 'acp',
      status: 'idle',
    },
    {
      slot_id: 'slot-2',
      conversation_id: 'conv-2',
      role: 'teammate',
      agent_type: 'acp',
      agent_name: 'Worker',
      conversation_type: 'acp',
      status: 'idle',
    },
  ],
} as TTeam;

const make404 = () =>
  new BackendHttpError({
    method: 'DELETE',
    path: '/api/teams/team-1/agents/slot-2',
    status: 404,
    body: { success: false, error: 'slot-2', code: 'NOT_FOUND' },
  });

const make500 = () =>
  new BackendHttpError({
    method: 'DELETE',
    path: '/api/teams/team-1/agents/slot-2',
    status: 500,
    body: { success: false, error: 'boom', code: 'INTERNAL' },
  });

describe('useTeamSession.removeAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateTeamMock.mockResolvedValue(undefined);
  });

  it('calls invoke and triggers mutateTeam on success', async () => {
    vi.mocked(ipcBridge.team.removeAgent.invoke).mockResolvedValue(undefined);

    const { result } = renderHook(() => useTeamSession(team));

    await act(async () => {
      await result.current.removeAgent('slot-2');
    });

    expect(ipcBridge.team.removeAgent.invoke).toHaveBeenCalledWith({ team_id: 'team-1', slot_id: 'slot-2' });
    expect(mutateTeamMock).toHaveBeenCalledTimes(1);
  });

  it('treats 404 NOT_FOUND as idempotent success: warns and still mutates', async () => {
    vi.mocked(ipcBridge.team.removeAgent.invoke).mockRejectedValue(make404());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useTeamSession(team));

    await act(async () => {
      await expect(result.current.removeAgent('slot-2')).resolves.toBeUndefined();
    });

    expect(ipcBridge.team.removeAgent.invoke).toHaveBeenCalledWith({ team_id: 'team-1', slot_id: 'slot-2' });
    expect(mutateTeamMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('slot-2'));

    warnSpy.mockRestore();
  });

  it('propagates non-404 BackendHttpError and skips mutateTeam', async () => {
    vi.mocked(ipcBridge.team.removeAgent.invoke).mockRejectedValue(make500());

    const { result } = renderHook(() => useTeamSession(team));

    await act(async () => {
      await expect(result.current.removeAgent('slot-2')).rejects.toBeInstanceOf(BackendHttpError);
    });

    expect(mutateTeamMock).not.toHaveBeenCalled();
  });

  it('propagates generic errors and skips mutateTeam', async () => {
    vi.mocked(ipcBridge.team.removeAgent.invoke).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useTeamSession(team));

    await act(async () => {
      await expect(result.current.removeAgent('slot-2')).rejects.toThrow('network down');
    });

    expect(mutateTeamMock).not.toHaveBeenCalled();
  });
});
