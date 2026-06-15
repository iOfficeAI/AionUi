import { describe, expect, it, vi } from 'vitest';
import {
  buildTeamSendRuntime,
  buildTeamStopHandler,
} from '../../../packages/desktop/src/renderer/pages/team/components/teamSendRuntime';
import type { TeamRunViewState } from '../../../packages/desktop/src/renderer/pages/team/hooks/useTeamRunView';

const activeRunView: TeamRunViewState = {
  activeRun: {
    team_id: 'team-1',
    team_run_id: 'run-1',
    target_slot_id: 'lead',
    target_role: 'lead',
    status: 'running',
    active_child_count: 1,
    pending_wake_count: 0,
    starting_child_count: 0,
  },
  childTurnsBySlot: {},
  slotWorkBySlot: {},
};

describe('buildTeamSendRuntime', () => {
  it('does not lock leader sendbox for teammate-only active work', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: {
        activeRun: {
          ...activeRunView.activeRun!,
          active_child_count: 1,
          pending_wake_count: 1,
          starting_child_count: 1,
          slot_work: [
            {
              slot_id: 'worker',
              role: 'teammate',
              pending_wake_count: 1,
              starting_child_count: 0,
              active_turn_id: 'turn-worker',
            },
          ],
        },
        childTurnsBySlot: {
          worker: {
            team_id: 'team-1',
            team_run_id: 'run-1',
            slot_id: 'worker',
            role: 'teammate',
            conversation_id: 'conv-worker',
            turn_id: 'turn-worker',
            status: 'running',
          },
        },
        slotWorkBySlot: {
          worker: {
            slot_id: 'worker',
            role: 'teammate',
            pending_wake_count: 1,
            starting_child_count: 0,
            active_turn_id: 'turn-worker',
          },
        },
      },
    });

    expect(runtime.loading).toBe(false);
    expect(runtime.runtimeGate.canSendMessage).toBe(true);
    expect(runtime.runtimeGate.isProcessing).toBe(false);
  });

  it('locks leader sendbox while leader slot has pending work', () => {
    const leaderWork = {
      slot_id: 'lead',
      role: 'lead' as const,
      pending_wake_count: 1,
      starting_child_count: 0,
      active_turn_id: undefined,
    };
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: {
        activeRun: {
          team_id: 'team-1',
          team_run_id: 'run-1',
          target_slot_id: 'lead',
          target_role: 'lead',
          status: 'completed',
          active_child_count: 0,
          pending_wake_count: 1,
          starting_child_count: 0,
          slot_work: [leaderWork],
        },
        childTurnsBySlot: {},
        slotWorkBySlot: {
          lead: leaderWork,
        },
      },
    });

    expect(runtime.loading).toBe(true);
    expect(runtime.runtimeGate.canSendMessage).toBe(false);
    expect(runtime.runtimeGate.isProcessing).toBe(true);
  });

  it('allows priority send when slot is paused with suppressed work', () => {
    const leaderWork = {
      slot_id: 'lead',
      role: 'lead' as const,
      pending_wake_count: 0,
      starting_child_count: 0,
      paused: true,
      suppressed_wake_count: 2,
    };
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: {
        activeRun: {
          team_id: 'team-1',
          team_run_id: 'run-1',
          target_slot_id: 'lead',
          target_role: 'lead',
          status: 'running',
          active_child_count: 0,
          pending_wake_count: 0,
          starting_child_count: 0,
          slot_work: [leaderWork],
        },
        childTurnsBySlot: {},
        slotWorkBySlot: {
          lead: leaderWork,
        },
      },
    });

    expect(runtime.loading).toBe(false);
    expect(runtime.runtimeGate.canSendMessage).toBe(true);
    expect(runtime.runtimeGate.isProcessing).toBe(false);
  });

  it('allows priority send when paused slot still has stale active child status', () => {
    const leaderWork = {
      slot_id: 'lead',
      role: 'lead' as const,
      pending_wake_count: 0,
      starting_child_count: 0,
      paused: true,
      suppressed_wake_count: 1,
    };
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      runView: {
        activeRun: {
          team_id: 'team-1',
          team_run_id: 'run-1',
          target_slot_id: 'lead',
          target_role: 'lead',
          status: 'running',
          active_child_count: 1,
          pending_wake_count: 0,
          starting_child_count: 0,
          slot_work: [leaderWork],
        },
        childTurnsBySlot: {
          lead: {
            team_id: 'team-1',
            team_run_id: 'run-1',
            slot_id: 'lead',
            role: 'lead',
            conversation_id: 'conv-lead',
            turn_id: 'turn-lead',
            status: 'running',
          },
        },
        slotWorkBySlot: {
          lead: leaderWork,
        },
      },
    });

    expect(runtime.loading).toBe(false);
    expect(runtime.runtimeGate.canSendMessage).toBe(true);
    expect(runtime.runtimeGate.isProcessing).toBe(false);
  });

  it('does not lock teammate sendbox just because another team run is active', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'worker',
      runView: activeRunView,
    });

    expect(runtime.loading).toBe(false);
    expect(runtime.runtimeGate.canSendMessage).toBe(true);
    expect(runtime.runtimeGate.isProcessing).toBe(false);
  });

  it('locks teammate sendbox while its child turn is active', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'worker',
      runView: {
        ...activeRunView,
        childTurnsBySlot: {
          worker: {
            team_id: 'team-1',
            team_run_id: 'run-1',
            slot_id: 'worker',
            role: 'teammate',
            conversation_id: 'conv-worker',
            turn_id: 'turn-worker',
            status: 'running',
          },
        },
      },
    });

    expect(runtime.loading).toBe(true);
    expect(runtime.runtimeGate.canSendMessage).toBe(false);
    expect(runtime.runtimeGate.isProcessing).toBe(true);
  });

  it('shows a generic failure callback when team slot stop fails', async () => {
    const pauseSlotWork = vi.fn().mockRejectedValue(new Error('internal runtime cancel details'));
    const onStopFailed = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = buildTeamStopHandler({
      team_id: 'team-1',
      slot_id: 'lead',
      runView: {
        activeRun: activeRunView.activeRun,
        childTurnsBySlot: {},
        slotWorkBySlot: {
          lead: {
            slot_id: 'lead',
            role: 'lead',
            pending_wake_count: 0,
            starting_child_count: 0,
            active_turn_id: 'turn-lead',
          },
        },
      },
      pauseSlotWork,
      onStopFailed,
    });

    await handler();

    expect(pauseSlotWork).toHaveBeenCalledWith({
      team_id: 'team-1',
      team_run_id: 'run-1',
      slot_id: 'lead',
      reason: 'user_stop',
    });
    expect(onStopFailed).toHaveBeenCalledTimes(1);
    expect(onStopFailed).toHaveBeenCalledWith();
    expect(warn).toHaveBeenCalledWith('[TeamChatView] pause slot work failed', expect.any(Error));
    warn.mockRestore();
  });
});
