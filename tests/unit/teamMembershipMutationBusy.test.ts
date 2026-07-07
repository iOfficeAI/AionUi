import { describe, expect, it } from 'vitest';
import {
  applyTeamMcpPhaseToMembershipMutationState,
  applyTeamRuntimeStatusToMembershipMutationState,
  createTeamMembershipMutationState,
  isTeamMembershipMutationBusy,
} from '@/renderer/pages/team/hooks/teamMembershipMutationBusy';

describe('team membership mutation busy state', () => {
  it('blocks membership changes while the team session is injecting', () => {
    const state = applyTeamMcpPhaseToMembershipMutationState(createTeamMembershipMutationState(), 'session_injecting');

    expect(isTeamMembershipMutationBusy(state)).toBe(true);
  });

  it('keeps membership changes blocked until all runtime attach jobs finish', () => {
    let state = createTeamMembershipMutationState();

    state = applyTeamRuntimeStatusToMembershipMutationState(state, 'slot-a', 'pending');
    state = applyTeamRuntimeStatusToMembershipMutationState(state, 'slot-b', 'pending');
    state = applyTeamRuntimeStatusToMembershipMutationState(state, 'slot-a', 'ready');

    expect(isTeamMembershipMutationBusy(state)).toBe(true);

    state = applyTeamRuntimeStatusToMembershipMutationState(state, 'slot-b', 'failed');

    expect(isTeamMembershipMutationBusy(state)).toBe(false);
  });

  it('releases membership changes when session startup reaches a terminal phase', () => {
    let state = applyTeamMcpPhaseToMembershipMutationState(createTeamMembershipMutationState(), 'session_injecting');
    state = applyTeamRuntimeStatusToMembershipMutationState(state, 'slot-a', 'pending');

    state = applyTeamMcpPhaseToMembershipMutationState(state, 'session_error');

    expect(isTeamMembershipMutationBusy(state)).toBe(false);
  });
});
