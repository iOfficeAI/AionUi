import { describe, expect, it } from 'vitest';
import { buildTeamSendRuntime } from '../../../packages/desktop/src/renderer/pages/team/components/teamSendRuntime';
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
      isLeader: true,
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
      isLeader: true,
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

  it('does not lock teammate sendbox just because another team run is active', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'worker',
      isLeader: false,
      runView: activeRunView,
    });

    expect(runtime.loading).toBe(false);
    expect(runtime.runtimeGate.canSendMessage).toBe(true);
    expect(runtime.runtimeGate.isProcessing).toBe(false);
  });

  it('locks teammate sendbox while its child turn is active', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'worker',
      isLeader: false,
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
});
