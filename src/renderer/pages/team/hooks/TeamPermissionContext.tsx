import { ipcBridge } from '@/common';
import React, { createContext, useCallback, useContext, useMemo } from 'react';

type TeamPermissionContextValue = {
  /** Whether we are in team mode */
  isTeamMode: true;
  /** Whether the current active agent is the team lead */
  isLeadAgent: boolean;
  /** All agent conversation IDs in this team (for centralized confirmation listening) */
  allConversationIds: string[];
  /** Propagate a permission mode change from the leader to all member agents */
  propagateMode: (mode: string) => void;
};

const TeamPermissionContext = createContext<TeamPermissionContextValue | null>(null);

export const TeamPermissionProvider: React.FC<{
  children: React.ReactNode;
  isLeadAgent: boolean;
  allConversationIds: string[];
}> = ({ children, isLeadAgent, allConversationIds }) => {
  const propagateMode = useCallback(
    (mode: string) => {
      for (const conversationId of allConversationIds) {
        void ipcBridge.acpConversation.setMode.invoke({ conversationId, mode }).catch(() => {
          // Silently ignore failures for non-ACP agents (e.g. gemini, codex) that don't support setMode
        });
      }
    },
    [allConversationIds]
  );

  const value = useMemo<TeamPermissionContextValue>(
    () => ({
      isTeamMode: true,
      isLeadAgent,
      allConversationIds,
      propagateMode,
    }),
    [isLeadAgent, allConversationIds, propagateMode]
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
