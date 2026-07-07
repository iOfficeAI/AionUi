import type { TeamAgentRuntimeStatus, TeamMcpPhase } from '@/common/types/team/teamTypes';

export type TeamMembershipMutationState = {
  sessionInjecting: boolean;
  pendingRuntimeSlotIds: string[];
};

const SESSION_TERMINAL_PHASES = new Set<TeamMcpPhase>(['session_ready', 'session_error', 'load_failed']);

export function createTeamMembershipMutationState(): TeamMembershipMutationState {
  return {
    sessionInjecting: false,
    pendingRuntimeSlotIds: [],
  };
}

export function applyTeamMcpPhaseToMembershipMutationState(
  state: TeamMembershipMutationState,
  phase: TeamMcpPhase
): TeamMembershipMutationState {
  if (phase === 'session_injecting') {
    return { ...state, sessionInjecting: true };
  }

  if (SESSION_TERMINAL_PHASES.has(phase)) {
    return createTeamMembershipMutationState();
  }

  return state;
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
  return state.sessionInjecting || state.pendingRuntimeSlotIds.length > 0;
}
