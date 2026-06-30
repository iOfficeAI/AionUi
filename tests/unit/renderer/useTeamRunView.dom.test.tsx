import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ITeamChildTurnEvent, ITeamRunEvent } from '@/common/types/team/teamTypes';
import { useTeamRunView } from '@/renderer/pages/team/hooks/useTeamRunView';

type TeamRunHandler = (event: ITeamRunEvent) => void;
type ChildTurnHandler = (event: ITeamChildTurnEvent) => void;

const teamEventMocks = vi.hoisted(() => {
  const handlers: Record<string, unknown> = {};
  const makeInvoke = () => vi.fn();
  const makeOn = (name: string) =>
    vi.fn((handler: unknown) => {
      handlers[name] = handler;
      return vi.fn();
    });

  return {
    handlers,
    invoke: {
      getRunState: makeInvoke(),
    },
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
      listChanged: makeOn('listChanged'),
      sessionChanged: makeOn('sessionChanged'),
      agentSpawned: makeOn('agentSpawned'),
      agentRemoved: makeOn('agentRemoved'),
      agentRenamed: makeOn('agentRenamed'),
      reconnected: makeOn('reconnected'),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      getRunState: { invoke: teamEventMocks.invoke.getRunState },
      runAccepted: { on: teamEventMocks.on.runAccepted },
      runStarted: { on: teamEventMocks.on.runStarted },
      runUpdated: { on: teamEventMocks.on.runUpdated },
      runCompleted: { on: teamEventMocks.on.runCompleted },
      runCancelled: { on: teamEventMocks.on.runCancelled },
      runFailed: { on: teamEventMocks.on.runFailed },
      childTurnStarted: { on: teamEventMocks.on.childTurnStarted },
      childTurnCompleted: { on: teamEventMocks.on.childTurnCompleted },
      childTurnCancelled: { on: teamEventMocks.on.childTurnCancelled },
      listChanged: { on: teamEventMocks.on.listChanged },
      sessionChanged: { on: teamEventMocks.on.sessionChanged },
      agentSpawned: { on: teamEventMocks.on.agentSpawned },
      agentRemoved: { on: teamEventMocks.on.agentRemoved },
      agentRenamed: { on: teamEventMocks.on.agentRenamed },
    },
    realtime: {
      reconnected: { on: teamEventMocks.on.reconnected },
    },
  },
}));

describe('useTeamRunView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    teamEventMocks.invoke.getRunState.mockResolvedValue({ active_run: null });
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

  it('reconcile clears stale local state when backend has no active run', async () => {
    teamEventMocks.invoke.getRunState.mockResolvedValue({ active_run: null });
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;

    act(() => {
      runUpdated({
        team_id: 'team-1',
        team_run_id: 'run-old',
        target_slot_id: 'lead',
        target_role: 'lead',
        status: 'running',
        active_child_count: 0,
        pending_wake_count: 1,
        starting_child_count: 0,
        slot_work: [{ slot_id: 'lead', role: 'lead', pending_wake_count: 1, starting_child_count: 0 }],
      });
    });

    await act(async () => {
      await result.current.reconcile('test');
    });

    expect(result.current.state.activeRun).toBeUndefined();
    expect(result.current.state.childTurnsBySlot).toEqual({});
    expect(result.current.state.slotWorkBySlot).toEqual({});
  });

  it('reconcile replaces stale run and clears child turns when backend has active run', async () => {
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      active_run: {
        team_id: 'team-1',
        team_run_id: 'run-new',
        target_slot_id: 'lead',
        target_role: 'lead',
        status: 'running',
        active_child_count: 0,
        pending_wake_count: 1,
        starting_child_count: 0,
        slot_work: [{ slot_id: 'worker', role: 'teammate', pending_wake_count: 1, starting_child_count: 0 }],
      },
    });
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const childTurnStarted = teamEventMocks.handlers.childTurnStarted as ChildTurnHandler;

    act(() => {
      childTurnStarted({
        team_id: 'team-1',
        team_run_id: 'run-old',
        slot_id: 'lead',
        role: 'lead',
        conversation_id: 'conv-lead',
        turn_id: 'turn-old',
        status: 'running',
      });
    });

    await act(async () => {
      await result.current.reconcile('test');
    });

    expect(result.current.state.activeRun?.team_run_id).toBe('run-new');
    expect(result.current.state.childTurnsBySlot).toEqual({});
    expect(result.current.state.slotWorkBySlot.worker?.pending_wake_count).toBe(1);
    expect(result.current.state.slotWorkBySlot.lead).toBeUndefined();
  });

  it('reconcile preserves local state when run-state fetch fails', async () => {
    teamEventMocks.invoke.getRunState.mockRejectedValue(new Error('network'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;

    act(() => {
      runUpdated({
        team_id: 'team-1',
        team_run_id: 'run-1',
        target_slot_id: 'lead',
        target_role: 'lead',
        status: 'running',
        active_child_count: 0,
        pending_wake_count: 1,
        starting_child_count: 0,
        slot_work: [{ slot_id: 'lead', role: 'lead', pending_wake_count: 1, starting_child_count: 0 }],
      });
    });

    await act(async () => {
      const ok = await result.current.reconcile('test');
      expect(ok).toBe(false);
    });

    expect(result.current.state.activeRun?.team_run_id).toBe('run-1');
    expect(result.current.state.slotWorkBySlot.lead?.pending_wake_count).toBe(1);
    expect(warn).toHaveBeenCalledWith('[Renderer:teamRunView] run_state_reconcile_failed', expect.any(Object));
    warn.mockRestore();
  });

  it('reconciles after realtime reconnect', async () => {
    teamEventMocks.invoke.getRunState.mockResolvedValue({ active_run: null });
    renderHook(() => useTeamRunView('team-1'));
    teamEventMocks.invoke.getRunState.mockClear();

    await act(async () => {
      const reconnected = teamEventMocks.handlers.reconnected as () => void;
      reconnected();
    });

    expect(teamEventMocks.invoke.getRunState).toHaveBeenCalledWith({ team_id: 'team-1' });
  });

  it('reconciles current team after team refresh event only', async () => {
    teamEventMocks.invoke.getRunState.mockResolvedValue({ active_run: null });
    renderHook(() => useTeamRunView('team-1'));
    teamEventMocks.invoke.getRunState.mockClear();

    await act(async () => {
      const listChanged = teamEventMocks.handlers.listChanged as (event: { team_id: string }) => void;
      listChanged({ team_id: 'other-team' });
      listChanged({ team_id: 'team-1' });
    });

    expect(teamEventMocks.invoke.getRunState).toHaveBeenCalledTimes(1);
    expect(teamEventMocks.invoke.getRunState).toHaveBeenCalledWith({ team_id: 'team-1' });
  });
});
