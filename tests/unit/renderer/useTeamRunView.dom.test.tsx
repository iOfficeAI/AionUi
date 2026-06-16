import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ITeamChildTurnEvent, ITeamRunEvent } from '@/common/types/team/teamTypes';
import { useTeamRunView } from '@/renderer/pages/team/hooks/useTeamRunView';

type TeamRunHandler = (event: ITeamRunEvent) => void;
type ChildTurnHandler = (event: ITeamChildTurnEvent) => void;

const teamEventMocks = vi.hoisted(() => {
  const handlers: Record<string, unknown> = {};
  const makeOn = (name: string) =>
    vi.fn((handler: unknown) => {
      handlers[name] = handler;
      return vi.fn();
    });

  return {
    handlers,
    on: {
      runAccepted: makeOn('runAccepted'),
      runStarted: makeOn('runStarted'),
      runUpdated: makeOn('runUpdated'),
      runCompleted: makeOn('runCompleted'),
      runCancelled: makeOn('runCancelled'),
      runFailed: makeOn('runFailed'),
      childTurnStarted: makeOn('childTurnStarted'),
      childTurnCompleted: makeOn('childTurnCompleted'),
      childTurnCancelled: makeOn('childTurnCancelled'),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      runAccepted: { on: teamEventMocks.on.runAccepted },
      runStarted: { on: teamEventMocks.on.runStarted },
      runUpdated: { on: teamEventMocks.on.runUpdated },
      runCompleted: { on: teamEventMocks.on.runCompleted },
      runCancelled: { on: teamEventMocks.on.runCancelled },
      runFailed: { on: teamEventMocks.on.runFailed },
      childTurnStarted: { on: teamEventMocks.on.childTurnStarted },
      childTurnCompleted: { on: teamEventMocks.on.childTurnCompleted },
      childTurnCancelled: { on: teamEventMocks.on.childTurnCancelled },
    },
  },
}));

describe('useTeamRunView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(teamEventMocks.handlers)) {
      delete teamEventMocks.handlers[key];
    }
  });

  it('clears backend slow fields when an active child turn reaches a terminal state', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    const childTurnCompleted = teamEventMocks.handlers.childTurnCompleted as ChildTurnHandler;

    act(() => {
      runUpdated({
        team_id: 'team-1',
        team_run_id: 'run-1',
        target_slot_id: 'lead',
        target_role: 'lead',
        status: 'running',
        active_child_count: 1,
        pending_wake_count: 1,
        starting_child_count: 0,
        slot_work: [
          {
            slot_id: 'worker-1',
            role: 'teammate',
            pending_wake_count: 1,
            starting_child_count: 0,
            active_turn_id: 'turn-worker',
            active_turn_started_at_ms: 1_000,
            active_turn_elapsed_ms: 720_000,
            active_turn_slow: true,
            active_turn_slow_threshold_ms: 600_000,
          },
        ],
      });
    });

    expect(result.current.state.slotWorkBySlot['worker-1']?.active_turn_slow).toBe(true);

    act(() => {
      childTurnCompleted({
        team_id: 'team-1',
        team_run_id: 'run-1',
        slot_id: 'worker-1',
        role: 'teammate',
        conversation_id: 'conv-worker',
        turn_id: 'turn-worker',
        status: 'completed',
      });
    });

    const work = result.current.state.slotWorkBySlot['worker-1'];
    expect(work?.active_turn_id).toBeUndefined();
    expect(work?.active_turn_started_at_ms).toBeUndefined();
    expect(work?.active_turn_elapsed_ms).toBeUndefined();
    expect(work?.active_turn_slow).toBeUndefined();
    expect(work?.active_turn_slow_threshold_ms).toBeUndefined();
  });
});
