import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ITeamAgentStatusEvent,
  ITeamChildTurnEvent,
  ITeamRunAck,
  ITeamRunEvent,
  ITeamSessionStatusChangedEvent,
  ITeamSlotWork,
  ITeamSlotWorkChangedEvent,
} from '@/common/types/team/teamTypes';
import { useTeamRunView } from '@/renderer/pages/team/hooks/useTeamRunView';

type TeamRunHandler = (event: ITeamRunEvent) => void;
type ChildTurnHandler = (event: ITeamChildTurnEvent) => void;
type SessionStatusHandler = (event: ITeamSessionStatusChangedEvent) => void;
type AgentStatusHandler = (event: ITeamAgentStatusEvent) => void;

const teamEventMocks = vi.hoisted(() => {
  const handlers: Record<string, unknown> = {};
  const makeOn = (name: string) =>
    vi.fn((handler: unknown) => {
      handlers[name] = handler;
      return vi.fn();
    });
  return {
    handlers,
    invoke: { getRunState: vi.fn() },
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
      agentStatusChanged: makeOn('agentStatusChanged'),
      sessionStatusChanged: makeOn('sessionStatusChanged'),
      slotWorkChanged: makeOn('slotWorkChanged'),
      reconnected: makeOn('reconnected'),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      getRunState: { invoke: teamEventMocks.invoke.getRunState },
      ...Object.fromEntries(
        Object.entries(teamEventMocks.on)
          .filter(([name]) => name !== 'reconnected')
          .map(([name, on]) => [name, { on }])
      ),
    },
    realtime: { reconnected: { on: teamEventMocks.on.reconnected } },
  },
}));

const slotWork = (slot_id: string, overrides: Partial<ITeamSlotWork> = {}): ITeamSlotWork => ({
  slot_id,
  role: slot_id === 'lead' ? 'lead' : 'teammate',
  state: 'queued',
  queued_foreground_count: 0,
  queued_background_count: 1,
  active_turn_id: null,
  active_turn_started_at_ms: null,
  active_turn_elapsed_ms: null,
  active_turn_slow: null,
  active_turn_slow_threshold_ms: null,
  blocked_reason: null,
  team_run_id: null,
  ...overrides,
});

const runEvent = (overrides: Partial<ITeamRunEvent> = {}): ITeamRunEvent => ({
  team_id: 'team-1',
  team_run_id: 'run-1',
  source: 'user_message',
  has_user_intervention: false,
  target_slot_id: 'lead',
  target_role: 'lead',
  status: 'running',
  queued_intent_count: 1,
  starting_batch_count: 0,
  running_batch_count: 1,
  active_enqueue_lease_count: 0,
  slot_work: [slotWork('lead', { state: 'running', team_run_id: 'run-1' })],
  ...overrides,
});

describe('useTeamRunView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: null,
      active_run: null,
      slot_work: [],
    });
    for (const key of Object.keys(teamEventMocks.handlers)) delete teamEventMocks.handlers[key];
  });

  it('ack_applies_the_exact_core_run_snapshot', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const run = runEvent({
      has_user_intervention: true,
      queued_intent_count: 3,
      slot_work: [slotWork('lead', { queued_foreground_count: 2, team_run_id: 'run-1' })],
    });
    const ack: ITeamRunAck = { enqueue_status: 'queued', message_id: 'message-1', run };

    act(() => result.current.applyAck(ack));

    expect(result.current.state.activeRun).toEqual(run);
    expect(result.current.state.slotWorkBySlot).toEqual({ lead: run.slot_work[0] });
  });

  it('terminal_event_clears_only_active_run_and_keeps_global_slot_work', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const pausedLead = slotWork('lead', { state: 'paused', queued_background_count: 1 });
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    const terminalWork = slotWork('worker', { queued_background_count: 2 });
    const runCompleted = teamEventMocks.handlers.runCompleted as TeamRunHandler;

    act(() => runUpdated(runEvent({ slot_work: [pausedLead] })));
    act(() => runCompleted(runEvent({ status: 'completed', slot_work: [terminalWork] })));

    expect(result.current.state.activeRun).toBeUndefined();
    expect(result.current.state.slotWorkBySlot).toEqual({ lead: pausedLead, worker: terminalWork });
  });

  it('keeps_a_paused_teammate_when_a_lead_run_event_contains_only_lead_work', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    const pausedWorker = slotWork('worker', { state: 'paused', queued_background_count: 2 });

    act(() =>
      runUpdated(
        runEvent({
          slot_work: [pausedWorker],
          target_slot_id: 'worker',
          target_role: 'teammate',
        })
      )
    );
    act(() => runUpdated(runEvent({ team_run_id: 'run-2', slot_work: [slotWork('lead', { state: 'running' })] })));

    expect(result.current.state.slotWorkBySlot.worker).toEqual(pausedWorker);
  });

  it('child_events_do_not_invent_slot_work_counts', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const work = slotWork('worker', { queued_background_count: 4 });
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    const childStarted = teamEventMocks.handlers.childTurnStarted as ChildTurnHandler;
    const childCompleted = teamEventMocks.handlers.childTurnCompleted as ChildTurnHandler;
    const child: ITeamChildTurnEvent = {
      team_id: 'team-1',
      team_run_id: 'run-1',
      slot_id: 'worker',
      role: 'teammate',
      conversation_id: 'conv-worker',
      turn_id: 'turn-worker',
      status: 'running',
    };

    act(() => runUpdated(runEvent({ slot_work: [work] })));
    act(() => childStarted(child));
    expect(result.current.state.slotWorkBySlot.worker).toEqual(work);
    act(() => childCompleted({ ...child, status: 'completed' }));
    expect(result.current.state.slotWorkBySlot.worker).toEqual(work);
  });

  it('reconnect_replaces_all_slot_work_from_snapshot', async () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    act(() => runUpdated(runEvent({ slot_work: [slotWork('lead')] })));
    const replacement = slotWork('worker', { state: 'blocked', blocked_reason: 'runtime_starting' });
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: 'generation-2',
      active_run: null,
      slot_work: [replacement],
    });

    await act(async () => {
      (teamEventMocks.handlers.reconnected as () => void)();
    });

    await waitFor(() => expect(result.current.state.slotWorkBySlot).toEqual({ worker: replacement }));
    expect(result.current.state.activeRun).toBeUndefined();
  });

  it('background_slot_work_is_kept_without_an_active_run', async () => {
    const background = slotWork('worker', { queued_background_count: 2 });
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: 'generation-1',
      active_run: null,
      slot_work: [background],
    });

    const { result } = renderHook(() => useTeamRunView('team-1'));

    await waitFor(() => expect(result.current.state.slotWorkBySlot.worker).toEqual(background));
    expect(result.current.state.activeRun).toBeUndefined();
  });

  it('full_snapshot_restores_a_paused_teammate_with_its_retained_queue', async () => {
    const pausedWorker = slotWork('worker', { state: 'paused', queued_background_count: 2 });
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: 'generation-1',
      active_run: null,
      slot_work: [pausedWorker],
    });

    const { result } = renderHook(() => useTeamRunView('team-1'));

    await waitFor(() => expect(result.current.state.slotWorkBySlot.worker).toEqual(pausedWorker));
    expect(result.current.state.activeRun).toBeUndefined();
  });

  it('treats omitted slot work in a new team snapshot as empty', async () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    act(() => runUpdated(runEvent({ slot_work: [slotWork('lead')] })));
    teamEventMocks.invoke.getRunState.mockResolvedValue({ active_run: null });

    await act(async () => {
      expect(await result.current.reconcile('new-team')).toBe('applied');
    });

    expect(result.current.state.slotWorkBySlot).toEqual({});
    expect(result.current.state.activeRun).toBeUndefined();
  });

  it('slot_work_changed_clears_an_orphaned_running_slot_without_an_active_run', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runCompleted = teamEventMocks.handlers.runCompleted as TeamRunHandler;
    // A run completes while the leader is mid run-less trailing work, so the
    // terminal snapshot shows the leader still running and there is no active run
    // — the stuck-spinner condition.
    act(() =>
      runCompleted(
        runEvent({
          status: 'completed',
          slot_work: [
            slotWork('lead', { state: 'running', active_turn_id: 'turn-1', active_turn_started_at_ms: 1000 }),
          ],
        })
      )
    );
    expect(result.current.state.activeRun).toBeUndefined();
    expect(result.current.state.slotWorkBySlot.lead?.state).toBe('running');

    // The run-less batch finishes: a per-slot event flips the leader to idle.
    const slotWorkChanged = teamEventMocks.handlers.slotWorkChanged as (event: ITeamSlotWorkChangedEvent) => void;
    act(() => slotWorkChanged({ team_id: 'team-1', slot_work: slotWork('lead', { state: 'idle' }) }));

    expect(result.current.state.slotWorkBySlot.lead?.state).toBe('idle');
    expect(result.current.state.slotWorkBySlot.lead?.active_turn_id).toBeNull();
  });

  it('slot_work_changed_merges_one_slot_and_ignores_other_teams', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    act(() =>
      runUpdated(
        runEvent({
          slot_work: [slotWork('lead', { state: 'running' }), slotWork('worker', { state: 'running' })],
        })
      )
    );
    const slotWorkChanged = teamEventMocks.handlers.slotWorkChanged as (event: ITeamSlotWorkChangedEvent) => void;

    // Other-team events are ignored.
    act(() => slotWorkChanged({ team_id: 'other-team', slot_work: slotWork('lead', { state: 'idle' }) }));
    expect(result.current.state.slotWorkBySlot.lead?.state).toBe('running');

    // Updating one slot leaves the others untouched.
    act(() => slotWorkChanged({ team_id: 'team-1', slot_work: slotWork('worker', { state: 'idle' }) }));
    expect(result.current.state.slotWorkBySlot.worker?.state).toBe('idle');
    expect(result.current.state.slotWorkBySlot.lead?.state).toBe('running');
  });

  it('does_not_let_an_older_reconcile_overwrite_newer_idle_slot_work', async () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    await waitFor(() => expect(teamEventMocks.invoke.getRunState).toHaveBeenCalled());

    type Snapshot = {
      session_generation: string | null;
      active_run: ITeamRunEvent | null;
      slot_work: ITeamSlotWork[];
    };
    let resolveSnapshot!: (snapshot: Snapshot) => void;
    const pendingSnapshot = new Promise<Snapshot>((resolve) => {
      resolveSnapshot = resolve;
    });
    const idleWork = slotWork('lead', { state: 'idle', queued_background_count: 0 });
    teamEventMocks.invoke.getRunState.mockReturnValueOnce(pendingSnapshot).mockResolvedValueOnce({
      session_generation: 'generation-1',
      active_run: null,
      slot_work: [idleWork],
    });

    const reconcilePromise = result.current.reconcile('stale-snapshot');
    const slotWorkChanged = teamEventMocks.handlers.slotWorkChanged as (event: ITeamSlotWorkChangedEvent) => void;
    act(() =>
      slotWorkChanged({
        team_id: 'team-1',
        slot_work: slotWork('lead', { state: 'idle', queued_background_count: 0 }),
      })
    );

    await act(async () => {
      resolveSnapshot({
        session_generation: 'generation-1',
        active_run: runEvent(),
        slot_work: [slotWork('lead', { state: 'running', active_turn_id: 'turn-stale' })],
      });
      await reconcilePromise;
    });

    expect(await reconcilePromise).toBe('applied');
    expect(result.current.state.slotWorkBySlot.lead).toEqual(idleWork);
    expect(result.current.state.activeRun).toBeUndefined();
  });

  it('retries_a_snapshot_once_when_a_live_event_supersedes_the_first_request', async () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    await waitFor(() => expect(teamEventMocks.invoke.getRunState).toHaveBeenCalled());
    let resolveFirst!: (snapshot: {
      session_generation: string | null;
      active_run: ITeamRunEvent | null;
      slot_work: ITeamSlotWork[];
    }) => void;
    const first = new Promise<{
      session_generation: string | null;
      active_run: ITeamRunEvent | null;
      slot_work: ITeamSlotWork[];
    }>((resolve) => {
      resolveFirst = resolve;
    });
    const authoritative = slotWork('worker', { state: 'paused', queued_background_count: 2 });
    teamEventMocks.invoke.getRunState.mockReturnValueOnce(first).mockResolvedValueOnce({
      session_generation: 'generation-1',
      active_run: null,
      slot_work: [authoritative],
    });

    const reconcilePromise = result.current.reconcile('superseded-once');
    const slotWorkChanged = teamEventMocks.handlers.slotWorkChanged as (event: ITeamSlotWorkChangedEvent) => void;
    act(() => slotWorkChanged({ team_id: 'team-1', slot_work: slotWork('lead', { state: 'idle' }) }));
    await act(async () => {
      resolveFirst({
        session_generation: 'generation-1',
        active_run: runEvent(),
        slot_work: [slotWork('lead', { state: 'running' })],
      });
      expect(await reconcilePromise).toBe('applied');
    });

    expect(result.current.state.slotWorkBySlot).toEqual({ worker: authoritative });
  });

  it('treats_omitted_slot_work_in_a_full_snapshot_as_empty', async () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    act(() => runUpdated(runEvent({ slot_work: [slotWork('lead')] })));
    teamEventMocks.invoke.getRunState.mockResolvedValueOnce({ active_run: null });

    await act(async () => {
      expect(await result.current.reconcile('omitted-slot-work')).toBe('applied');
    });

    expect(result.current.state.slotWorkBySlot).toEqual({});
  });

  it('applies_a_local_pause_immediately_and_clears_active_turn_metadata', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    act(() =>
      runUpdated(
        runEvent({
          slot_work: [
            slotWork('worker', {
              state: 'running',
              active_turn_id: 'turn-worker',
              active_turn_started_at_ms: 1_000,
            }),
          ],
        })
      )
    );

    act(() => result.current.applyLocalPause('worker'));

    expect(result.current.state.slotWorkBySlot.worker?.state).toBe('paused');
    expect(result.current.state.slotWorkBySlot.worker?.active_turn_id).toBeNull();
    expect(result.current.state.slotWorkBySlot.worker?.active_turn_started_at_ms).toBeNull();
  });

  it('does_not_reconcile_a_paused_slot_only_because_it_retains_queued_work', async () => {
    const { result, unmount } = renderHook(() => useTeamRunView('team-1'));
    await waitFor(() => expect(teamEventMocks.invoke.getRunState).toHaveBeenCalledTimes(1));
    const slotWorkChanged = teamEventMocks.handlers.slotWorkChanged as (event: ITeamSlotWorkChangedEvent) => void;
    vi.useFakeTimers();

    try {
      act(() =>
        slotWorkChanged({
          team_id: 'team-1',
          slot_work: slotWork('worker', { state: 'paused', queued_background_count: 2 }),
        })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(teamEventMocks.invoke.getRunState).toHaveBeenCalledTimes(1);
      expect(result.current.state.slotWorkBySlot.worker?.state).toBe('paused');
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('reconciles_orphaned_teammate_work_when_the_final_idle_event_is_missed', async () => {
    const { result, unmount } = renderHook(() => useTeamRunView('team-1'));
    await waitFor(() => expect(teamEventMocks.invoke.getRunState).toHaveBeenCalled());
    const idleWork = slotWork('worker', { state: 'idle', queued_background_count: 0 });
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: 'generation-1',
      active_run: null,
      slot_work: [idleWork],
    });
    vi.useFakeTimers();

    try {
      const runCompleted = teamEventMocks.handlers.runCompleted as TeamRunHandler;
      act(() =>
        runCompleted(
          runEvent({
            status: 'completed',
            target_slot_id: 'worker',
            target_role: 'teammate',
            slot_work: [slotWork('worker', { state: 'running', active_turn_id: 'turn-worker' })],
          })
        )
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(result.current.state.slotWorkBySlot.worker).toEqual(idleWork);
      expect(result.current.state.activeRun).toBeUndefined();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('uses_idle_leader_status_to_reconcile_a_missed_terminal_run_event', async () => {
    const { result, unmount } = renderHook(() => useTeamRunView('team-1'));
    await waitFor(() => expect(teamEventMocks.invoke.getRunState).toHaveBeenCalled());
    const idleWork = slotWork('lead', { state: 'idle', queued_background_count: 0 });
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: 'generation-1',
      active_run: null,
      slot_work: [idleWork],
    });
    vi.useFakeTimers();

    try {
      const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
      const agentStatusChanged = teamEventMocks.handlers.agentStatusChanged as AgentStatusHandler;
      act(() => runUpdated(runEvent()));
      act(() => agentStatusChanged({ team_id: 'team-1', slot_id: 'lead', status: 'idle' }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });

      expect(result.current.state.activeRun).toBeUndefined();
      expect(result.current.state.slotWorkBySlot.lead).toEqual(idleWork);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('retries_orphan_reconciliation_after_a_transient_snapshot_failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useTeamRunView('team-1'));
    await waitFor(() => expect(teamEventMocks.invoke.getRunState).toHaveBeenCalled());
    const idleWork = slotWork('worker', { state: 'idle', queued_background_count: 0 });
    teamEventMocks.invoke.getRunState
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValue({ session_generation: 'generation-1', active_run: null, slot_work: [idleWork] });
    vi.useFakeTimers();

    try {
      const runCompleted = teamEventMocks.handlers.runCompleted as TeamRunHandler;
      act(() =>
        runCompleted(
          runEvent({
            status: 'completed',
            target_slot_id: 'worker',
            target_role: 'teammate',
            slot_work: [slotWork('worker', { state: 'running', active_turn_id: 'turn-worker' })],
          })
        )
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(result.current.state.slotWorkBySlot.worker).toEqual(idleWork);
      expect(warn).toHaveBeenCalledWith('[Renderer:teamRunView] run_state_reconcile_failed', expect.any(Object));
    } finally {
      unmount();
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('session_status_stopped_sets_session_stopped_flag', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const sessionStatus = teamEventMocks.handlers.sessionStatusChanged as SessionStatusHandler;

    act(() => sessionStatus({ team_id: 'team-1', status: 'stopped' }));

    expect(result.current.state.sessionStopped).toBe(true);
  });

  it('session_status_ready_and_starting_clear_the_session_stopped_flag', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const sessionStatus = teamEventMocks.handlers.sessionStatusChanged as SessionStatusHandler;

    act(() => sessionStatus({ team_id: 'team-1', status: 'stopped' }));
    expect(result.current.state.sessionStopped).toBe(true);

    act(() => sessionStatus({ team_id: 'team-1', status: 'starting' }));
    expect(result.current.state.sessionStopped).toBe(false);

    act(() => sessionStatus({ team_id: 'team-1', status: 'stopped' }));
    act(() => sessionStatus({ team_id: 'team-1', status: 'ready' }));
    expect(result.current.state.sessionStopped).toBe(false);
  });

  it('session_status_stopped_is_ignored_for_other_teams', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const sessionStatus = teamEventMocks.handlers.sessionStatusChanged as SessionStatusHandler;

    act(() => sessionStatus({ team_id: 'other-team', status: 'stopped' }));

    expect(result.current.state.sessionStopped).toBe(false);
  });

  it('applied_active_run_event_self_heals_the_session_stopped_flag', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const sessionStatus = teamEventMocks.handlers.sessionStatusChanged as SessionStatusHandler;
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;

    act(() => sessionStatus({ team_id: 'team-1', status: 'stopped' }));
    expect(result.current.state.sessionStopped).toBe(true);

    act(() => runUpdated(runEvent()));

    expect(result.current.state.sessionStopped).toBe(false);
  });
});
