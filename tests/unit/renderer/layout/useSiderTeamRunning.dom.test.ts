import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ITeamRunEvent,
  ITeamRunStateResponse,
  ITeamSlotWork,
  TeamRunStatus,
  TTeam,
} from '@/common/types/team/teamTypes';
import { useSiderTeamRunning } from '@/renderer/components/layout/Sider/useSiderTeamRunning';

type TeamRunHandler = (event: ITeamRunEvent) => void;
type ReconnectedHandler = (event: { timestamp: number }) => void;

const bridgeMocks = vi.hoisted(() => {
  const handlers: Record<string, unknown> = {};
  const unsubscribes: Record<string, ReturnType<typeof vi.fn>> = {};
  const makeOn = (name: string) =>
    vi.fn((handler: unknown) => {
      handlers[name] = handler;
      const unsubscribe = vi.fn();
      unsubscribes[name] = unsubscribe;
      return unsubscribe;
    });

  return {
    handlers,
    unsubscribes,
    getRunState: vi.fn(),
    on: {
      runAccepted: makeOn('runAccepted'),
      runStarted: makeOn('runStarted'),
      runUpdated: makeOn('runUpdated'),
      runCompleted: makeOn('runCompleted'),
      runCancelled: makeOn('runCancelled'),
      runFailed: makeOn('runFailed'),
      reconnected: makeOn('reconnected'),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      getRunState: { invoke: bridgeMocks.getRunState },
      runAccepted: { on: bridgeMocks.on.runAccepted },
      runStarted: { on: bridgeMocks.on.runStarted },
      runUpdated: { on: bridgeMocks.on.runUpdated },
      runCompleted: { on: bridgeMocks.on.runCompleted },
      runCancelled: { on: bridgeMocks.on.runCancelled },
      runFailed: { on: bridgeMocks.on.runFailed },
    },
    realtime: { reconnected: { on: bridgeMocks.on.reconnected } },
  },
}));

const emptyRunState = (): ITeamRunStateResponse => ({
  session_generation: null,
  active_run: null,
  slot_work: [],
});

const team = (id: string): TTeam => ({
  id,
  user_id: 'user-1',
  name: id,
  workspace: '/tmp/workspace',
  workspace_mode: 'shared',
  leader_assistant_id: 'slot-1',
  assistants: [],
  created_at: 1,
  updated_at: 1,
});

const runEvent = (overrides: Partial<ITeamRunEvent> = {}): ITeamRunEvent => ({
  team_id: 'team-1',
  team_run_id: 'run-1',
  source: 'user_message',
  has_user_intervention: false,
  target_slot_id: 'slot-1',
  target_role: 'lead',
  status: 'running',
  queued_intent_count: 0,
  starting_batch_count: 0,
  running_batch_count: 1,
  active_enqueue_lease_count: 0,
  slot_work: [],
  ...overrides,
});

const idleSlot = (overrides: Partial<ITeamSlotWork> = {}): ITeamSlotWork => ({
  slot_id: 'slot-1',
  role: 'lead',
  state: 'idle',
  queued_foreground_count: 0,
  queued_background_count: 0,
  active_turn_id: null,
  active_turn_started_at_ms: null,
  active_turn_elapsed_ms: null,
  active_turn_slow: null,
  active_turn_slow_threshold_ms: null,
  blocked_reason: null,
  team_run_id: 'run-1',
  ...overrides,
});

/** A running event with zero work counters and all-idle slots (orphaned state). */
const idleRunEvent = (overrides: Partial<ITeamRunEvent> = {}): ITeamRunEvent =>
  runEvent({
    queued_intent_count: 0,
    starting_batch_count: 0,
    running_batch_count: 0,
    active_enqueue_lease_count: 0,
    slot_work: [idleSlot()],
    ...overrides,
  });

const emitRun = (channel: keyof typeof bridgeMocks.on, event: ITeamRunEvent) => {
  act(() => {
    (bridgeMocks.handlers[channel] as TeamRunHandler)(event);
  });
};

const emitReconnect = () => {
  act(() => {
    (bridgeMocks.handlers.reconnected as ReconnectedHandler)({ timestamp: Date.now() });
  });
};

const flushInitialReconcile = async () => {
  await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(1));
  await act(async () => {
    await Promise.resolve();
  });
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const ACTIVE_CASES = [
  ['runAccepted', 'accepted'],
  ['runStarted', 'running'],
  ['runUpdated', 'cancelling'],
] as const satisfies ReadonlyArray<[keyof typeof bridgeMocks.on, TeamRunStatus]>;

const TERMINAL_CASES = [
  ['runCompleted', 'completed'],
  ['runCancelled', 'cancelled'],
  ['runFailed', 'failed'],
] as const satisfies ReadonlyArray<[keyof typeof bridgeMocks.on, TeamRunStatus]>;

describe('useSiderTeamRunning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.getRunState.mockReset();
    bridgeMocks.getRunState.mockResolvedValue(emptyRunState());
    Object.keys(bridgeMocks.handlers).forEach((key) => delete bridgeMocks.handlers[key]);
    Object.keys(bridgeMocks.unsubscribes).forEach((key) => delete bridgeMocks.unsubscribes[key]);
  });

  it.each(ACTIVE_CASES)('shows a team as running for %s events', async (channel, status) => {
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await flushInitialReconcile();

    emitRun(channel, runEvent({ status }));

    expect(result.current('team-1')).toBe(true);
  });

  it.each(TERMINAL_CASES)('stops showing a team as running for %s events', async (channel, status) => {
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await flushInitialReconcile();
    emitRun('runAccepted', runEvent({ status: 'accepted' }));

    emitRun(channel, runEvent({ status }));

    expect(result.current('team-1')).toBe(false);
  });

  it('keeps a newer run visible when an older run finishes late', async () => {
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await flushInitialReconcile();
    emitRun('runAccepted', runEvent({ team_run_id: 'run-old', status: 'accepted' }));
    emitRun('runAccepted', runEvent({ team_run_id: 'run-new', status: 'accepted' }));

    emitRun('runCompleted', runEvent({ team_run_id: 'run-old', status: 'completed' }));
    expect(result.current('team-1')).toBe(true);

    emitRun('runCompleted', runEvent({ team_run_id: 'run-new', status: 'completed' }));
    expect(result.current('team-1')).toBe(false);
  });

  it('ignores duplicate, unrelated, and unknown-status lifecycle events', async () => {
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await flushInitialReconcile();
    const activeRun = runEvent({ team_run_id: 'run-active', status: 'accepted' });

    emitRun('runAccepted', activeRun);
    emitRun('runAccepted', activeRun);
    emitRun('runCompleted', runEvent({ team_run_id: 'run-missing', status: 'completed' }));
    emitRun('runUpdated', runEvent({ team_run_id: 'run-active', status: 'unknown' as TeamRunStatus }));

    expect(result.current('team-1')).toBe(true);
    emitRun('runCompleted', runEvent({ team_run_id: 'run-active', status: 'completed' }));
    expect(result.current('team-1')).toBe(false);
  });

  it('keeps run state isolated by team ID', async () => {
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1'), team('team-2')]));
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(2));

    emitRun('runStarted', runEvent({ team_id: 'team-2' }));

    expect(result.current('team-1')).toBe(false);
    expect(result.current('team-2')).toBe(true);
  });

  it('hydrates a run that started before the sidebar subscribed', async () => {
    bridgeMocks.getRunState.mockResolvedValue({
      ...emptyRunState(),
      active_run: runEvent({ status: 'running' }),
    });

    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));

    await waitFor(() => expect(result.current('team-1')).toBe(true));
  });

  it('clears stale running state from the authoritative reconnect snapshot', async () => {
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await flushInitialReconcile();
    emitRun('runStarted', runEvent());
    bridgeMocks.getRunState.mockResolvedValueOnce(emptyRunState());

    emitReconnect();

    await waitFor(() => expect(result.current('team-1')).toBe(false));
  });

  it('does not let a snapshot overwrite a newer live event', async () => {
    const pendingSnapshot = deferred<ITeamRunStateResponse>();
    const followupSnapshot = deferred<ITeamRunStateResponse>();
    bridgeMocks.getRunState.mockReturnValueOnce(pendingSnapshot.promise).mockReturnValueOnce(followupSnapshot.promise);
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(1));

    emitRun('runAccepted', runEvent({ status: 'accepted' }));
    await act(async () => pendingSnapshot.resolve(emptyRunState()));
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(2));
    await act(async () =>
      followupSnapshot.resolve({
        ...emptyRunState(),
        active_run: runEvent({ status: 'accepted' }),
      })
    );

    expect(result.current('team-1')).toBe(true);
  });

  it('reconciles again when live events make the latest reconnect snapshot stale', async () => {
    const reconnectSnapshot = deferred<ITeamRunStateResponse>();
    const followupSnapshot = deferred<ITeamRunStateResponse>();
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await flushInitialReconcile();
    emitRun('runStarted', runEvent({ team_run_id: 'run-a' }));
    bridgeMocks.getRunState
      .mockReturnValueOnce(reconnectSnapshot.promise)
      .mockReturnValueOnce(followupSnapshot.promise);

    emitReconnect();
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(2));
    emitRun('runStarted', runEvent({ team_run_id: 'run-b' }));
    emitRun('runCompleted', runEvent({ team_run_id: 'run-b', status: 'completed' }));
    await act(async () => reconnectSnapshot.resolve(emptyRunState()));

    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(3));
    await act(async () => followupSnapshot.resolve(emptyRunState()));
    await waitFor(() => expect(result.current('team-1')).toBe(false));
  });

  it('ignores an older reconcile response after a newer reconcile completes', async () => {
    const initialSnapshot = deferred<ITeamRunStateResponse>();
    const reconnectSnapshot = deferred<ITeamRunStateResponse>();
    bridgeMocks.getRunState.mockReturnValueOnce(initialSnapshot.promise).mockReturnValueOnce(reconnectSnapshot.promise);
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(1));

    emitReconnect();
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(2));
    await act(async () =>
      reconnectSnapshot.resolve({
        ...emptyRunState(),
        active_run: runEvent({ team_run_id: 'run-new' }),
      })
    );
    await act(async () => initialSnapshot.resolve(emptyRunState()));

    expect(result.current('team-1')).toBe(true);
  });

  it('preserves event-derived state when reconnect reconciliation fails', async () => {
    const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await flushInitialReconcile();
    emitRun('runStarted', runEvent());
    bridgeMocks.getRunState.mockRejectedValueOnce(new Error('offline'));

    emitReconnect();
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(2));

    expect(result.current('team-1')).toBe(true);
  });

  it('reconciles added teams and removes deleted teams', async () => {
    bridgeMocks.getRunState.mockImplementation(async ({ team_id }: { team_id: string }) => ({
      ...emptyRunState(),
      active_run: team_id === 'team-2' ? runEvent({ team_id: 'team-2' }) : null,
    }));
    const { result, rerender } = renderHook(({ teams }: { teams: TTeam[] }) => useSiderTeamRunning(teams), {
      initialProps: { teams: [team('team-1')] },
    });
    await flushInitialReconcile();
    emitRun('runStarted', runEvent());

    rerender({ teams: [team('team-2')] });

    await waitFor(() => expect(result.current('team-2')).toBe(true));
    expect(result.current('team-1')).toBe(false);
  });

  it('keeps reconciliation metadata for teams that remain when another team is removed', async () => {
    const { result, rerender } = renderHook(({ teams }: { teams: TTeam[] }) => useSiderTeamRunning(teams), {
      initialProps: { teams: [team('team-1'), team('team-2')] },
    });
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(2));
    emitRun('runStarted', runEvent({ team_id: 'team-1' }));
    emitRun('runStarted', runEvent({ team_id: 'team-2' }));

    rerender({ teams: [team('team-1')] });

    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current('team-1')).toBe(false));
    expect(result.current('team-2')).toBe(false);
  });

  it('does not restore a deleted team from a late snapshot', async () => {
    const pendingSnapshot = deferred<ITeamRunStateResponse>();
    bridgeMocks.getRunState.mockReturnValueOnce(pendingSnapshot.promise);
    const { result, rerender } = renderHook(({ teams }: { teams: TTeam[] }) => useSiderTeamRunning(teams), {
      initialProps: { teams: [team('team-1')] },
    });
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(1));

    rerender({ teams: [] });
    await act(async () =>
      pendingSnapshot.resolve({
        ...emptyRunState(),
        active_run: runEvent(),
      })
    );

    expect(result.current('team-1')).toBe(false);
  });

  it('does not accept an old snapshot after a team ID is removed and re-added', async () => {
    const removedTeamSnapshot = deferred<ITeamRunStateResponse>();
    const readdedTeamSnapshot = deferred<ITeamRunStateResponse>();
    bridgeMocks.getRunState
      .mockReturnValueOnce(removedTeamSnapshot.promise)
      .mockReturnValueOnce(readdedTeamSnapshot.promise);
    const { result, rerender } = renderHook(({ teams }: { teams: TTeam[] }) => useSiderTeamRunning(teams), {
      initialProps: { teams: [team('team-1')] },
    });
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(1));

    rerender({ teams: [] });
    rerender({ teams: [team('team-1')] });
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(2));
    await act(async () =>
      readdedTeamSnapshot.resolve({
        ...emptyRunState(),
        active_run: runEvent({ team_run_id: 'run-new' }),
      })
    );
    await act(async () => removedTeamSnapshot.resolve(emptyRunState()));

    expect(result.current('team-1')).toBe(true);
  });

  it('ignores lifecycle events for a team after it is removed', async () => {
    const { result, rerender } = renderHook(({ teams }: { teams: TTeam[] }) => useSiderTeamRunning(teams), {
      initialProps: { teams: [team('team-1')] },
    });
    await flushInitialReconcile();

    rerender({ teams: [] });
    emitRun('runStarted', runEvent());

    expect(result.current('team-1')).toBe(false);
  });

  it('ignores a reconciliation response that arrives after unmount', async () => {
    const pendingSnapshot = deferred<ITeamRunStateResponse>();
    bridgeMocks.getRunState.mockReturnValueOnce(pendingSnapshot.promise);
    const { result, unmount } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await waitFor(() => expect(bridgeMocks.getRunState).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () =>
      pendingSnapshot.resolve({
        ...emptyRunState(),
        active_run: runEvent(),
      })
    );

    expect(result.current('team-1')).toBe(false);
  });

  it('unsubscribes from every lifecycle source on unmount', async () => {
    const { unmount } = renderHook(() => useSiderTeamRunning([team('team-1')]));
    await waitFor(() => expect(Object.keys(bridgeMocks.unsubscribes)).toHaveLength(7));

    unmount();

    expect(Object.values(bridgeMocks.unsubscribes).every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(
      true
    );
  });

  describe('orphaned running protection', () => {
    it('does not mark a team as running for an idle running event (zero counters, idle slots)', async () => {
      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
      await flushInitialReconcile();

      emitRun('runStarted', idleRunEvent());

      expect(result.current('team-1')).toBe(false);
    });

    it('does not mark a team as running for an idle running event with empty slot_work', async () => {
      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
      await flushInitialReconcile();

      emitRun('runStarted', idleRunEvent({ slot_work: [] }));

      expect(result.current('team-1')).toBe(false);
    });

    it.each([
      ['queued intents', { queued_intent_count: 1 }],
      ['starting batches', { starting_batch_count: 1 }],
      ['running batches', { running_batch_count: 1 }],
      ['active enqueue leases', { active_enqueue_lease_count: 1 }],
    ] as const)('marks a running event as active when %s is nonzero', async (_, overrides) => {
      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
      await flushInitialReconcile();

      emitRun('runStarted', idleRunEvent(overrides));

      expect(result.current('team-1')).toBe(true);
    });

    it.each(['queued', 'starting', 'running', 'paused', 'blocked'] as const)(
      'keeps a team running when a slot is %s even with zero counters',
      async (state) => {
        const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
        await flushInitialReconcile();

        emitRun('runStarted', idleRunEvent({ slot_work: [idleSlot({ state })] }));

        expect(result.current('team-1')).toBe(true);
      }
    );

    it('treats an accepted event with zero counters as active', async () => {
      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
      await flushInitialReconcile();

      emitRun('runAccepted', idleRunEvent({ status: 'accepted' }));

      expect(result.current('team-1')).toBe(true);
    });

    it('treats a cancelling event with zero counters as active', async () => {
      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
      await flushInitialReconcile();

      emitRun('runUpdated', idleRunEvent({ status: 'cancelling' }));

      expect(result.current('team-1')).toBe(true);
    });

    it('keeps an already-active team running when a transient idle running update arrives', async () => {
      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
      await flushInitialReconcile();
      emitRun('runAccepted', runEvent({ status: 'accepted' }));

      emitRun('runUpdated', idleRunEvent());

      expect(result.current('team-1')).toBe(true);
    });

    it('does not resurrect the spinner from a late idle running replay after a terminal event', async () => {
      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));
      await flushInitialReconcile();
      emitRun('runAccepted', runEvent({ status: 'accepted' }));
      emitRun('runCompleted', runEvent({ status: 'completed' }));
      expect(result.current('team-1')).toBe(false);

      emitRun('runStarted', idleRunEvent());

      expect(result.current('team-1')).toBe(false);
    });

    it('clears an orphaned running snapshot when counters are zero and slots are idle', async () => {
      bridgeMocks.getRunState.mockResolvedValue({
        ...emptyRunState(),
        active_run: idleRunEvent(),
      });

      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));

      await waitFor(() => expect(result.current('team-1')).toBe(false));
    });

    it('keeps a team running when a snapshot active_run has a busy slot with zero counters', async () => {
      bridgeMocks.getRunState.mockResolvedValue({
        ...emptyRunState(),
        active_run: idleRunEvent({ slot_work: [idleSlot({ state: 'running' })] }),
      });

      const { result } = renderHook(() => useSiderTeamRunning([team('team-1')]));

      await waitFor(() => expect(result.current('team-1')).toBe(true));
    });
  });
});
