import type { TeamAgentRuntimeStatus, TeamSessionStatus } from '@/common/types/team/teamTypes';

export type TeamMembershipMutationState = {
  sessionStarting: boolean;
  pendingRuntimeSlotIds: string[];
};

export function createTeamMembershipMutationState(): TeamMembershipMutationState {
  return {
    sessionStarting: false,
    pendingRuntimeSlotIds: [],
  };
}

export function applyTeamSessionStatusToMembershipMutationState(
  state: TeamMembershipMutationState,
  status: TeamSessionStatus
): TeamMembershipMutationState {
  if (status === 'starting') {
    return { ...state, sessionStarting: true };
  }

  return createTeamMembershipMutationState();
}

export function applyTeamRuntimeStatusToMembershipMutationState(
  state: TeamMembershipMutationState,
  slot_id: string,
  status: TeamAgentRuntimeStatus
): TeamMembershipMutationState {
  if (status === 'pending') {
    if (state.pendingRuntimeSlotIds.includes(slot_id)) return state;
    return {
      ...state,
      pendingRuntimeSlotIds: [...state.pendingRuntimeSlotIds, slot_id],
    };
  }

  return {
    ...state,
    pendingRuntimeSlotIds: state.pendingRuntimeSlotIds.filter((id) => id !== slot_id),
  };
}

export function isTeamMembershipMutationBusy(state: TeamMembershipMutationState): boolean {
  return state.sessionStarting || state.pendingRuntimeSlotIds.length > 0;
}
