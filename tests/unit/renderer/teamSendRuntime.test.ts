import { describe, expect, it, vi } from 'vitest';
import type { ITeamSlotWork, TeamSlotBlockedReason } from '@/common/types/team/teamTypes';
import { buildTeamSendRuntime, buildTeamStopHandler } from '@/renderer/pages/team/components/teamSendRuntime';
import type { TeamRunViewState } from '@/renderer/pages/team/hooks/useTeamRunView';

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

const view = (slotWork?: ITeamSlotWork): TeamRunViewState => ({
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
});

describe('buildTeamSendRuntime', () => {
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

  it.each<TeamSlotBlockedReason>(['runtime_failed', 'removing', 'session_stopped'])(
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
