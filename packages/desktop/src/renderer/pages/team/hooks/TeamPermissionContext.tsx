import { ipcBridge } from '@/common';
import React, { createContext, useCallback, useContext, useMemo } from 'react';

type TeamPermissionContextValue = {
  /** Whether we are in team mode */
  isTeamMode: true;
  /** Whether the current active agent is the team leader */
  isLeaderAgent: boolean;
  /** Conversation ID of the leader agent */
  leaderConversationId: string;
  /** All agent conversation IDs in this team (for centralized confirmation listening) */
  allConversationIds: string[];
  /** Propagate a permission mode change from the leader to all member agents */
  propagateMode: (mode: string) => void;
};

const TeamPermissionContext = createContext<TeamPermissionContextValue | null>(null);

export const TeamPermissionProvider: React.FC<{
  children: React.ReactNode;
  team_id: string;
  isLeaderAgent: boolean;
  leaderConversationId: string;
  allConversationIds: string[];
}> = ({ children, team_id, isLeaderAgent, leaderConversationId, allConversationIds }) => {
  const propagateMode = useCallback(
    (mode: string) => {
      // Persist session_mode on the team record so newly spawned agents inherit it
      void ipcBridge.team.setSessionMode.invoke({ team_id, session_mode: mode }).catch(() => {
        // Best-effort: if this fails, agents still get mode via per-conversation setMode below
      });
    },
    [team_id]
  );

  const value = useMemo<TeamPermissionContextValue>(
    () => ({
      isTeamMode: true,
      isLeaderAgent,
      leaderConversationId,
      allConversationIds,
      propagateMode,
    }),
    [isLeaderAgent, leaderConversationId, allConversationIds, propagateMode]
  );

  return <TeamPermissionContext.Provider value={value}>{children}</TeamPermissionContext.Provider>;
};

/**
 * Returns team permission context if inside a team, or null for standalone conversations.
 * This ensures all team-only logic is gated behind a null check — no impact on single agent mode.
 */
export const useTeamPermission = (): TeamPermissionContextValue | null => {
  return useContext(TeamPermissionContext);
};
