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
};

describe('buildTeamSendRuntime', () => {
  it('locks leader sendbox while team run is active', () => {
    const runtime = buildTeamSendRuntime({
      slot_id: 'lead',
      isLeader: true,
      runView: activeRunView,
    });

    expect(runtime.loading).toBe(true);
    expect(runtime.runtimeGate.canSendMessage).toBe(false);
    expect(runtime.runtimeGate.isProcessing).toBe(true);
  });

  it('locks leader sendbox while team run reports starting work', () => {
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
          pending_wake_count: 0,
          starting_child_count: 1,
        },
        childTurnsBySlot: {},
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
