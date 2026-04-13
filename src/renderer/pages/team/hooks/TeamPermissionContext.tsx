import { ipcBridge } from '@/common';
import { getBackendModes, getModeLevel, getPermissionMap } from '@/common/types/agentPermissionLevel';
import React, { createContext, useCallback, useContext, useMemo } from 'react';

type AgentEntry = {
  conversationId: string;
  /** Backend type of the agent, e.g. 'claude', 'gemini', 'qwen' */
  agentType: string;
};

type TeamPermissionContextValue = {
  /** Whether we are in team mode */
  isTeamMode: true;
  /** Whether the current active agent is the team lead */
  isLeadAgent: boolean;
  /** Conversation ID of the lead agent (used to identify lead slot) */
  leadConversationId: string;
  /** All agent conversation IDs in this team (for centralized confirmation listening) */
  allConversationIds: string[];
  /** Propagate a permission mode change from the leader to all member agents */
  propagateMode: (mode: string) => void;
};

const TeamPermissionContext = createContext<TeamPermissionContextValue | null>(null);

export const TeamPermissionProvider: React.FC<{
  children: React.ReactNode;
  teamId: string;
  isLeadAgent: boolean;
  leadConversationId: string;
  allConversationIds: string[];
  /** Full agent list with backend types for permission mapping */
  agents: AgentEntry[];
}> = ({ children, teamId, isLeadAgent, leadConversationId, allConversationIds, agents }) => {
  const propagateMode = useCallback(
    (mode: string) => {
      // Persist sessionMode on the team record so newly spawned agents inherit it
      void ipcBridge.team.setSessionMode.invoke({ teamId, sessionMode: mode }).catch(() => {
        // Best-effort: if this fails, agents still get mode via per-conversation setMode below
      });

      const leaderLevel = getModeLevel(mode);

      for (const agent of agents) {
        // Leader's own mode was already set by AgentModeSelector — skip
        if (agent.conversationId === leadConversationId) continue;

        // Map leader's mode to the closest equivalent for this member's backend
        const memberBackend = agent.agentType;
        const memberModes = getBackendModes(memberBackend);
        const mappedMode = memberModes.length > 0 ? getPermissionMap(mode, memberModes) : mode;

        // null means L3 target but member has no L3 mode → use 'default' as placeholder
        // Manager-layer teamLeaderLevel handles the actual auto-approval
        const finalMode = mappedMode ?? 'default';

        void ipcBridge.acpConversation.setMode
          .invoke({ conversationId: agent.conversationId, mode: finalMode })
          .catch(() => {
            // Silently ignore failures for non-ACP agents (e.g. gemini, codex) that don't support setMode
          });

        // Write teamLeaderLevel + mapped sessionMode to conversation extra for Manager-layer fallback.
        // Cast needed: extra type is a discriminated union across conversation types;
        // teamLeaderLevel is a cross-cutting team field present on acp/gemini variants.
        void ipcBridge.conversation.update
          .invoke({
            id: agent.conversationId,
            updates: {
              extra: { sessionMode: finalMode, teamLeaderLevel: leaderLevel } as Record<string, unknown>,
            },
          })
          .catch(() => {
            // Best-effort
          });
      }
    },
    [teamId, agents, leadConversationId]
  );

  const value = useMemo<TeamPermissionContextValue>(
    () => ({
      isTeamMode: true,
      isLeadAgent,
      leadConversationId,
      allConversationIds,
      propagateMode,
    }),
    [isLeadAgent, leadConversationId, allConversationIds, propagateMode]
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

export type { AgentEntry };
