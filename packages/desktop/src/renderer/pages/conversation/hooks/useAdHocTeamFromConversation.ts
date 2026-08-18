/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TAdHocTeamAssociation, TAdHocTeamCreateResult } from '@/common/types/team/adHocTeamTypes';
import type {
  ITeamChildTurnEvent,
  ITeamRunEvent,
  ITeamSlotWork,
  ITeamTaskChangedEvent,
  TeamRunStatus,
  TTeam,
} from '@/common/types/team/teamTypes';
import type { ITeamTeammateMessageEvent } from '@/common/types/team/teamTypes';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAdHocTeamName } from './adHocTeamNaming';

const DEFAULT_USER_ID = 'system_default_user';

export type TAdHocLastTeammateMessage = ITeamTeammateMessageEvent & {
  team_id: string;
};

export type UseAdHocTeamFromConversationResult = {
  association: TAdHocTeamAssociation | null;
  team: TTeam | null;
  teammates: TTeam['assistants'];
  result: TAdHocTeamCreateResult | null;
  isLoading: boolean;
  error: Error | null;
  create: (targetAssistantId: string) => Promise<TAdHocTeamCreateResult>;
  clearError: () => void;
  lastTeammateMessage: TAdHocLastTeammateMessage | null;
  unreadTeammateMessageCount: number;
  clearUnreadTeammateMessages: () => void;
  isTeamRunning: boolean;
  activeRun?: ITeamRunEvent;
  slotWorkBySlot: Record<string, ITeamSlotWork | undefined>;
  childTurnsBySlot: Record<string, ITeamChildTurnEvent | undefined>;
};

/**
 * Page-private hook for creating or reusing the ad-hoc team associated with a
 * normal conversation. Keeps the caller on the current route; no navigation is
 * performed here.
 *
 * The hook also subscribes to lightweight team runtime events so the source
 * conversation UI stays in sync when the team is renamed, removed, or when
 * teammate messages arrive.
 */
export function useAdHocTeamFromConversation(
  conversationId: string | undefined,
  userId?: string,
  sourceTitle?: string
): UseAdHocTeamFromConversationResult {
  const { t } = useTranslation();
  const resolvedUserId = userId ?? DEFAULT_USER_ID;
  const [association, setAssociation] = useState<TAdHocTeamAssociation | null>(null);
  const [team, setTeam] = useState<TTeam | null>(null);
  const [result, setResult] = useState<TAdHocTeamCreateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastTeammateMessage, setLastTeammateMessage] = useState<TAdHocLastTeammateMessage | null>(null);
  const [unreadTeammateMessageCount, setUnreadTeammateMessageCount] = useState(0);
  const [activeRun, setActiveRun] = useState<ITeamRunEvent | undefined>(undefined);
  const [slotWorkBySlot, setSlotWorkBySlot] = useState<Record<string, ITeamSlotWork | undefined>>({});
  const [childTurnsBySlot, setChildTurnsBySlot] = useState<Record<string, ITeamChildTurnEvent | undefined>>({});

  const fetchAssociation = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const data = await ipcBridge.team.getByConversation.invoke({
        conversation_id: conversationId,
        user_id: resolvedUserId,
      });
      setAssociation(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, resolvedUserId]);

  const fetchTeam = useCallback(async (teamId: string) => {
    try {
      const data = await ipcBridge.team.get.invoke({ id: teamId });
      setTeam(data);
    } catch (err) {
      console.error('[useAdHocTeamFromConversation] Failed to fetch team summary:', err);
    }
  }, []);

  const clearRunState = useCallback(() => {
    setActiveRun(undefined);
    setSlotWorkBySlot({});
    setChildTurnsBySlot({});
  }, []);

  const fetchRunState = useCallback(async (teamId: string) => {
    try {
      const snapshot = await ipcBridge.team.getRunState.invoke({ team_id: teamId });
      setActiveRun(snapshot.active_run ?? undefined);
      setSlotWorkBySlot(indexSlotWork(snapshot.slot_work));
    } catch (err) {
      console.error('[useAdHocTeamFromConversation] Failed to fetch run state:', err);
    }
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setAssociation(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    ipcBridge.team.getByConversation
      .invoke({ conversation_id: conversationId, user_id: resolvedUserId })
      .then((data) => {
        if (!cancelled) setAssociation(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, resolvedUserId]);

  useEffect(() => {
    const teamId = association?.team_id;
    if (!teamId) {
      setTeam(null);
      clearRunState();
      return;
    }
    void fetchTeam(teamId);
    void fetchRunState(teamId);
  }, [association?.team_id, clearRunState, fetchRunState, fetchTeam]);

  useEffect(() => {
    const teamId = association?.team_id;
    const teamConversationIds = new Set(team?.assistants.map((a) => a.conversation_id) ?? []);
    if (!teamId || teamConversationIds.size === 0) return;

    const handleRunEvent = (event: ITeamRunEvent) => {
      if (event.team_id !== teamId) return;
      if (TERMINAL_RUN_STATUSES.has(event.status)) {
        setActiveRun(undefined);
        setSlotWorkBySlot(indexSlotWork(event.slot_work));
        return;
      }
      if (event.status === 'accepted') {
        void fetchRunState(teamId);
        return;
      }
      setActiveRun(event);
      setSlotWorkBySlot(indexSlotWork(event.slot_work));
    };

    const handleChildStarted = (event: ITeamChildTurnEvent) => {
      if (event.team_id !== teamId) return;
      setChildTurnsBySlot((prev) => ({ ...prev, [event.slot_id]: event }));
    };

    const handleChildTerminal = (event: ITeamChildTurnEvent) => {
      if (event.team_id !== teamId) return;
      setChildTurnsBySlot((prev) => {
        const next = { ...prev };
        delete next[event.slot_id];
        return next;
      });
    };

    const handleTaskChanged = (event: ITeamTaskChangedEvent) => {
      if (event.team_id !== teamId) return;
      void fetchTeam(teamId);
    };

    const handlers = [
      ipcBridge.team.removed.on((event) => {
        if (event.team_id === teamId) void fetchAssociation();
      }),
      ipcBridge.team.renamed.on((event) => {
        if (event.team_id === teamId) void fetchTeam(teamId);
      }),
      ipcBridge.team.agentStatusChanged.on((event) => {
        if (event.team_id === teamId) void fetchTeam(teamId);
      }),
      ipcBridge.team.sessionChanged.on((event) => {
        if (event.team_id === teamId) void fetchTeam(teamId);
      }),
      ipcBridge.team.teammateMessage.on((event) => {
        if (!teamConversationIds.has(event.conversation_id)) return;
        setLastTeammateMessage({ ...event, team_id: teamId });
        setUnreadTeammateMessageCount((prev) => prev + 1);
      }),
      ipcBridge.team.runAccepted.on(handleRunEvent),
      ipcBridge.team.runStarted.on(handleRunEvent),
      ipcBridge.team.runUpdated.on(handleRunEvent),
      ipcBridge.team.runCompleted.on(handleRunEvent),
      ipcBridge.team.runCancelled.on(handleRunEvent),
      ipcBridge.team.runFailed.on(handleRunEvent),
      ipcBridge.team.childTurnStarted.on(handleChildStarted),
      ipcBridge.team.childTurnCompleted.on(handleChildTerminal),
      ipcBridge.team.childTurnCancelled.on(handleChildTerminal),
      ipcBridge.team.taskChanged.on(handleTaskChanged),
    ];

    return () => {
      handlers.forEach((unsubscribe) => unsubscribe());
    };
  }, [association?.team_id, fetchAssociation, team?.assistants, fetchTeam]);

  const create = useCallback(
    async (targetAssistantId: string): Promise<TAdHocTeamCreateResult> => {
      if (!conversationId) throw new Error('Conversation ID is required');
      setError(null);
      setIsLoading(true);
      try {
        const created = await ipcBridge.team.fromConversation.invoke({
          conversation_id: conversationId,
          user_id: resolvedUserId,
          target_assistant_id: targetAssistantId,
          name: getAdHocTeamName(sourceTitle, t('team.sider.adHocTooltip')),
        });
        setResult(created);
        setAssociation({
          team_id: created.team_id,
          origin_conversation_id: created.origin_conversation_id,
          status: 'active',
        });
        return created;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        setError(normalized);
        throw normalized;
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, resolvedUserId, sourceTitle, t]
  );

  const clearError = useCallback(() => setError(null), []);
  const clearUnreadTeammateMessages = useCallback(() => setUnreadTeammateMessageCount(0), []);

  const isTeamRunning = activeRun !== undefined && !TERMINAL_RUN_STATUSES.has(activeRun.status);

  return {
    association,
    team,
    teammates: team?.assistants ?? [],
    result,
    isLoading,
    error,
    create,
    clearError,
    lastTeammateMessage,
    unreadTeammateMessageCount,
    clearUnreadTeammateMessages,
    isTeamRunning,
    activeRun,
    slotWorkBySlot,
    childTurnsBySlot,
  };
}

const TERMINAL_RUN_STATUSES = new Set<TeamRunStatus>(['completed', 'cancelled', 'failed']);

const indexSlotWork = (slotWork: ITeamSlotWork[]): Record<string, ITeamSlotWork | undefined> => {
  const indexed: Record<string, ITeamSlotWork | undefined> = {};
  for (const work of slotWork) {
    indexed[work.slot_id] = work;
  }
  return indexed;
};
