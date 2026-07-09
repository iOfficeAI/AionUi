import { describe, expect, it } from 'vitest';
import {
  applyTeamRuntimeStatusToMembershipMutationState,
  applyTeamSessionStatusToMembershipMutationState,
  createTeamMembershipMutationState,
  isTeamMembershipMutationBusy,
} from '@/renderer/pages/team/hooks/teamMembershipMutationBusy';

describe('team membership mutation busy state', () => {
  it('marks busy while the team session is starting', () => {
    const state = applyTeamSessionStatusToMembershipMutationState(createTeamMembershipMutationState(), 'starting');

    expect(state.sessionStarting).toBe(true);
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

  it('clears session busy state when the team session is ready or failed', () => {
    let state = applyTeamSessionStatusToMembershipMutationState(createTeamMembershipMutationState(), 'starting');
    state = applyTeamSessionStatusToMembershipMutationState(state, 'ready');

    expect(isTeamMembershipMutationBusy(state)).toBe(false);

    state = applyTeamSessionStatusToMembershipMutationState(createTeamMembershipMutationState(), 'starting');
    state = applyTeamSessionStatusToMembershipMutationState(state, 'failed');

    expect(isTeamMembershipMutationBusy(state)).toBe(false);
  });
});
