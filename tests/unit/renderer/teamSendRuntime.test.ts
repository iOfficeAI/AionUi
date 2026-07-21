import { describe, expect, it, vi } from 'vitest';
import type { ITeamSlotWork, TeamSlotBlockedReason } from '@/common/types/team/teamTypes';
import {
  buildTeamRetryStartHandler,
  buildTeamSendRuntime,
  buildTeamStopHandler,
  buildTeamWorkStatusText,
} from '@/renderer/pages/team/components/teamSendRuntime';
import type { TeamRunViewState } from '@/renderer/pages/team/hooks/useTeamRunView';
import { ipcBridge } from '@/common';

vi.mock('@/common', () => ({
  ipcBridge: { team: { attachAgent: { invoke: vi.fn(() => Promise.resolve()) } } },
}));

const work = (overrides: Partial<ITeamSlotWork> = {}): ITeamSlotWork => ({
  slot_id: 'lead',
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

const view = (slotWork?: ITeamSlotWork, sessionStopped = false): TeamRunViewState => ({
  activeRun: {
    team_id: 'team-1',
    team_run_id: 'run-1',
    source: 'user_message',
    has_user_intervention: false,
    target_slot_id: 'lead',
    target_role: 'lead',
    status: 'running',
    queued_intent_count: slotWork?.queued_foreground_count ?? 0,
    starting_batch_count: slotWork?.state === 'starting' ? 1 : 0,
    running_batch_count: slotWork?.state === 'running' ? 1 : 0,
    active_enqueue_lease_count: 0,
    slot_work: slotWork ? [slotWork] : [],
  },
  childTurnsBySlot: {},
  slotWorkBySlot: slotWork ? { [slotWork.slot_id]: slotWork } : {},
  sessionStopped,
});

describe('buildTeamSendRuntime', () => {
  it('treats the first queued user-visible team work item as processing', () => {
    const slotWork = work({
      state: 'queued',
      queued_foreground_count: 1,
    });
    const runtime = buildTeamSendRuntime({ slot_id: 'lead', runView: view(slotWork) });

    expect(runtime.loading).toBe(true);
    expect(runtime.queuedCount).toBe(1);
  });

  it('posts immediately while the slot is running with queued work', () => {
    const slotWork = work({
      state: 'running',
      queued_foreground_count: 2,
      queued_background_count: 3,
      active_turn_id: 'turn-1',
    });
    const runtime = buildTeamSendRuntime({ slot_id: 'lead', runView: view(slotWork), statusText: '5 queued' });

    expect(runtime.loading).toBe(true);
    expect(runtime.queuedCount).toBe(5);
    expect(runtime.statusText).toBe('5 queued');
    expect(runtime.runtimeGate).toEqual({ hydrated: true, canSendMessage: true, isProcessing: false });
  });

  it('keeps the stop affordance while a batch is starting', () => {
    const onStop = vi.fn(async () => {});
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: view(work({ state: 'starting' })),
      onStop,
    });

    expect(runtime.loading).toBe(true);
    expect(runtime.onStop).toBe(onStop);
    expect(runtime.runtimeGate.canSendMessage).toBe(true);
  });

  it('allows sending while RuntimeStarting is blocked', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: view(work({ state: 'blocked', blocked_reason: 'runtime_starting' })),
      statusText: 'Waiting for this assistant to start…',
    });

    expect(runtime.loading).toBe(false);
    expect(runtime.statusText).toBe('Waiting for this assistant to start…');
    expect(runtime.runtimeGate.canSendMessage).toBe(true);
  });

  it.each<TeamSlotBlockedReason>(['runtime_failed', 'removing'])(
    'blocks sending for fatal reason %s',
    (blocked_reason) => {
      const runtime = buildTeamSendRuntime({
        slot_id: 'lead',
        runView: view(work({ state: 'blocked', blocked_reason })),
        statusText: blocked_reason,
      });

      expect(runtime.runtimeGate.canSendMessage).toBe(false);
      expect(runtime.runtimeGate.isProcessing).toBe(false);
      expect(runtime.statusText).toBe(blocked_reason);
    }
  );

  it('keeps sending open for a stale session_stopped slot (recoverable, not fatal)', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: view(work({ state: 'blocked', blocked_reason: 'session_stopped' })),
      statusText: 'session stopped',
    });

    expect(runtime.runtimeGate.canSendMessage).toBe(true);
    expect(runtime.statusText).toBe('session stopped');
  });

  it('forces the recoverable-stopped shape when sessionStopped is set', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: view(work({ state: 'running', active_turn_id: 'turn-1' }), true),
      statusText: 'The team session has stopped.',
      sessionStopped: true,
    });

    expect(runtime.runtimeGate.canSendMessage).toBe(true);
    expect(runtime.loading).toBe(false);
    expect(runtime.statusText).toBe('The team session has stopped.');
  });

  it('overrides a residual fatal block when sessionStopped is set', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: view(work({ state: 'blocked', blocked_reason: 'runtime_failed' }), true),
      statusText: 'The team session has stopped.',
      sessionStopped: true,
    });

    expect(runtime.runtimeGate.canSendMessage).toBe(true);
    expect(runtime.loading).toBe(false);
  });

  it('exposes the active turn start timestamp from slot work', () => {
    const slotWork = work({ state: 'running', active_turn_id: 'turn-1', active_turn_started_at_ms: 1_700_000_000_000 });
    const runtime = buildTeamSendRuntime({ slot_id: 'lead', runView: view(slotWork) });

    expect(runtime.startedAtMs).toBe(1_700_000_000_000);
  });

  it('normalizes a null start timestamp to null', () => {
    const slotWork = work({ state: 'running', active_turn_id: 'turn-1', active_turn_started_at_ms: null });
    const runtime = buildTeamSendRuntime({ slot_id: 'lead', runView: view(slotWork) });

    expect(runtime.startedAtMs).toBeNull();
  });

  it('returns a null start timestamp when the slot has no work', () => {
    const runtime = buildTeamSendRuntime({ slot_id: 'missing', runView: view() });

    expect(runtime.startedAtMs).toBeNull();
  });
});

describe('buildTeamWorkStatusText', () => {
  const text = (slotWork?: ITeamSlotWork) =>
    buildTeamWorkStatusText(slotWork, {
      processing: () => 'processing',
      processingWithQueued: (count) => `processing + ${count} queued`,
      runtimeStarting: () => 'runtime starting',
      runtimeFailed: () => 'runtime failed',
      removing: () => 'removing',
      sessionStopped: () => 'session stopped',
    });

  it('shows processing instead of queued for a freshly accepted single work item', () => {
    expect(text(work({ state: 'queued', queued_foreground_count: 1 }))).toBe('processing');
  });

  it('shows only additional queued work while a turn is already running', () => {
    expect(text(work({ state: 'running', queued_foreground_count: 1, active_turn_id: 'turn-1' }))).toBe(
      'processing + 1 queued'
    );
  });

  it('hides queued count while work has not started yet', () => {
    expect(text(work({ state: 'queued', queued_foreground_count: 2 }))).toBe('processing');
  });
});

describe('buildTeamStopHandler', () => {
  it('uses authoritative state and queued counts rather than child events', async () => {
    const slotWork = work({ state: 'queued', queued_background_count: 2 });
    const pauseSlotWork = vi.fn(async () => {});
    const handler = buildTeamStopHandler({
      team_id: 'team-1',
      slot_id: 'lead',
      runView: view(slotWork),
      pauseSlotWork,
    });

    await handler();

    expect(pauseSlotWork).toHaveBeenCalledWith({
      team_id: 'team-1',
      team_run_id: 'run-1',
      slot_id: 'lead',
      reason: 'user_stop',
    });
  });
});

describe('buildTeamRetryStartHandler', () => {
  it('invokes the directed per-member attach route (not warmupSession)', async () => {
    const invoke = vi.mocked(ipcBridge.team.attachAgent.invoke);
    invoke.mockClear();
    await buildTeamRetryStartHandler({ team_id: 't1', slot_id: 's2' })();
    expect(invoke).toHaveBeenCalledWith({ team_id: 't1', slot_id: 's2' });
  });
});
