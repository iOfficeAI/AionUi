// src/renderer/pages/team/hooks/useTeamActiveSession.ts
//
// Manages the multi-session dimension of a team (migration 030). Tracks the
// list of working sessions, the active session's per-slot conversation
// bindings, and exposes create / switch / rename / delete actions.
//
// `resolveConversationId(slotId)` is the key helper for the chat view: when a
// non-primary session is active it returns that session's conversation id for
// the slot; otherwise it falls back to the roster id (preserving single-
// session behaviour for backends that predate multi-session support).

import { ipcBridge } from '@/common';
import type { TTeamSession } from '@/common/types/team/teamTypes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

const SESSIONS_KEY = (teamId: string) => `team/${teamId}/sessions`;
const ACTIVE_KEY = (teamId: string, sessionId: string | undefined) =>
  sessionId ? `team/${teamId}/sessions/${sessionId}` : null;

export function useTeamActiveSession(teamId: string, activeSessionId: string | undefined) {
  // List of sessions (no per-slot bindings; the list endpoint omits them).
  const { data: sessions, mutate: mutateSessions } = useSWR<TTeamSession[]>(teamId ? SESSIONS_KEY(teamId) : null, () =>
    ipcBridge.team.listSessions.invoke({ team_id: teamId })
  );

  // Active session with per-slot conversation bindings.
  const { data: activeSession, mutate: mutateActive } = useSWR<TTeamSession>(ACTIVE_KEY(teamId, activeSessionId), () =>
    ipcBridge.team.getSession.invoke({ team_id: teamId, session_id: activeSessionId! })
  );

  // slot_id -> conversation_id for the active session (empty for the primary
  // session of a pre-multi-session backend, which means "use the roster id").
  const slotConversationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of activeSession?.agents ?? []) {
      map.set(agent.slot_id, agent.conversation_id);
    }
    return map;
  }, [activeSession]);

  /** Resolve the conversation id to display for a given roster slot.
   *  Falls back to the roster conversation id when the active session has no
   *  explicit binding for the slot (primary session / legacy backend). */
  const resolveConversationId = useCallback(
    (slotId: string, rosterConversationId: string): string => {
      return slotConversationMap.get(slotId) ?? rosterConversationId;
    },
    [slotConversationMap]
  );

  const createSession = useCallback(
    async (name?: string) => {
      const created = await ipcBridge.team.createSession.invoke({ team_id: teamId, name });
      await mutateSessions();
      return created;
    },
    [teamId, mutateSessions]
  );

  const renameSession = useCallback(
    async (sessionId: string, name: string) => {
      await ipcBridge.team.renameSession.invoke({ team_id: teamId, session_id: sessionId, name });
      await mutateSessions();
      if (sessionId === activeSessionId) {
        await mutateActive();
      }
    },
    [teamId, mutateSessions, mutateActive, activeSessionId]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await ipcBridge.team.deleteSession.invoke({ team_id: teamId, session_id: sessionId });
      await mutateSessions();
    },
    [teamId, mutateSessions]
  );

  const switchSession = useCallback(
    async (sessionId: string) => {
      await ipcBridge.team.setActiveSession.invoke({ team_id: teamId, session_id: sessionId });
    },
    [teamId]
  );

  // When the session list changes (e.g. after delete), refresh so the UI
  // never points at a stale active session.
  useEffect(() => {
    void mutateActive();
  }, [sessions, mutateActive]);

  return {
    sessions: sessions ?? [],
    activeSession,
    slotConversationMap,
    resolveConversationId,
    createSession,
    renameSession,
    deleteSession,
    switchSession,
    mutateSessions,
    mutateActive,
  };
}
