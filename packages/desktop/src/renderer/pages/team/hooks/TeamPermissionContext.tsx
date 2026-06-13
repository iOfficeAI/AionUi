import { ipcBridge } from '@/common';
import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

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
  /** Trigger session warmup (idempotent, returns cached promise) */
  warmupSession: () => Promise<void>;
};

const TeamPermissionContext = createContext<TeamPermissionContextValue | null>(null);

export const TeamPermissionProvider: React.FC<{
  children: React.ReactNode;
  team_id: string;
  isLeaderAgent: boolean;
  leaderConversationId: string;
  allConversationIds: string[];
}> = ({ children, team_id, isLeaderAgent, leaderConversationId, allConversationIds }) => {
  const warmupPromiseRef = useRef<Promise<void> | null>(null);

  const propagateMode = useCallback(
    (mode: string) => {
      // Persist session_mode on the team record so newly spawned agents inherit it
      void ipcBridge.team.setSessionMode.invoke({ team_id, session_mode: mode }).catch(() => {
        // Best-effort: if this fails, active agents still receive per-conversation config updates.
      });
    },
    [team_id]
  );

  const warmupSession = useCallback((): Promise<void> => {
    if (warmupPromiseRef.current) {
      return warmupPromiseRef.current;
    }

    const promise = ipcBridge.team.ensureSession.invoke({ team_id });
    // Fire-and-forget callers only use warmup as a hint; attach a no-op catch
    // so rejected warmups do not surface as unhandled promise rejections.
    void promise.catch(() => {});
    warmupPromiseRef.current = promise.finally(() => {
      warmupPromiseRef.current = null;
    });
    return warmupPromiseRef.current;
  }, [team_id]);

  const value = useMemo<TeamPermissionContextValue>(
    () => ({
      isTeamMode: true,
      isLeaderAgent,
      leaderConversationId,
      allConversationIds,
      propagateMode,
      warmupSession,
    }),
    [isLeaderAgent, leaderConversationId, allConversationIds, propagateMode, warmupSession]
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
