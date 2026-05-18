/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useCallback, useEffect, useMemo } from 'react';
import useSWR from 'swr';

type ProjectExecutorState = {
  conversationId: string;
  currentExecutorId: string;
  pendingExecutorId?: string;
  status: string;
  updatedAt: number;
};

type ProjectExecutorCandidate = {
  id: string;
  label: string;
  agentType: string;
  source: string;
  available: boolean;
};

type ProjectExecutorSwitchRecord = {
  conversationId: string;
  fromExecutorId: string;
  toExecutorId: string;
  reason: string;
  queuedAt: number;
  switchedAt?: number;
  status: string;
};

type QueueProjectExecutorSwitchResult = {
  applied: boolean;
  state: ProjectExecutorState;
  record?: ProjectExecutorSwitchRecord;
};

type BridgeResponse<T> = {
  success: boolean;
  msg?: string;
  data?: T;
};

type ProjectExecutorChangedEvent = {
  conversationId: string;
};

type InvokeProvider<TParams, TResult> = {
  invoke: (params: TParams) => Promise<BridgeResponse<TResult>>;
};

type ProjectExecutorConversationBridge = {
  getProjectExecutorState?: InvokeProvider<{ conversation_id: string }, ProjectExecutorState>;
  getProjectExecutorCandidates?: InvokeProvider<{ conversation_id: string }, ProjectExecutorCandidate[]>;
  getProjectExecutorHistory?: InvokeProvider<{ conversation_id: string }, ProjectExecutorSwitchRecord[]>;
  queueProjectExecutorSwitch?: InvokeProvider<
    { conversation_id: string; targetExecutorId: string },
    QueueProjectExecutorSwitchResult
  >;
  cancelPendingProjectExecutorSwitch?: InvokeProvider<{ conversation_id: string }, ProjectExecutorState>;
  projectExecutorChanged?: {
    on: (listener: (event: ProjectExecutorChangedEvent) => void) => () => void;
  };
};

type UseProjectAgentHandoffResult = {
  state?: ProjectExecutorState;
  candidates: ProjectExecutorCandidate[];
  availableCandidates: ProjectExecutorCandidate[];
  history: ProjectExecutorSwitchRecord[];
  pendingCandidate?: ProjectExecutorCandidate;
  isLoading: boolean;
  queueSwitch: (targetExecutorId: string) => Promise<QueueProjectExecutorSwitchResult>;
  cancelPendingSwitch: () => Promise<ProjectExecutorState>;
  refresh: () => Promise<void>;
};

const conversationBridge = ipcBridge.conversation as unknown as ProjectExecutorConversationBridge;

const loadExecutorState = async (conversationId: string): Promise<ProjectExecutorState | undefined> => {
  if (!conversationBridge.getProjectExecutorState) {
    return undefined;
  }
  const result = await conversationBridge.getProjectExecutorState.invoke({ conversation_id: conversationId });
  if (!result.success) {
    console.warn('[useProjectAgentHandoff] Failed to load executor state:', result.msg);
    return undefined;
  }
  return result.data;
};

const loadExecutorCandidates = async (conversationId: string): Promise<ProjectExecutorCandidate[]> => {
  if (!conversationBridge.getProjectExecutorCandidates) {
    return [];
  }
  const result = await conversationBridge.getProjectExecutorCandidates.invoke({ conversation_id: conversationId });
  if (!result.success || !result.data) {
    console.warn('[useProjectAgentHandoff] Failed to load executor candidates:', result.msg);
    return [];
  }
  return result.data;
};

const loadExecutorHistory = async (conversationId: string): Promise<ProjectExecutorSwitchRecord[]> => {
  if (!conversationBridge.getProjectExecutorHistory) {
    return [];
  }
  const result = await conversationBridge.getProjectExecutorHistory.invoke({ conversation_id: conversationId });
  if (!result.success || !result.data) {
    console.warn('[useProjectAgentHandoff] Failed to load executor history:', result.msg);
    return [];
  }
  return result.data;
};

export const useProjectAgentHandoff = (conversationId?: string): UseProjectAgentHandoffResult => {
  const {
    data: state,
    isLoading: loadingState,
    mutate: mutateState,
  } = useSWR(
    conversationId ? ['project-agent-handoff', 'state', conversationId] : null,
    async ([, , id]: readonly [string, string, string]) => loadExecutorState(id),
    {
      revalidateOnFocus: false,
    }
  );
  const {
    data: candidates,
    isLoading: loadingCandidates,
    mutate: mutateCandidates,
  } = useSWR(
    conversationId ? ['project-agent-handoff', 'candidates', conversationId] : null,
    async ([, , id]: readonly [string, string, string]) => loadExecutorCandidates(id),
    {
      revalidateOnFocus: false,
    }
  );
  const {
    data: history,
    isLoading: loadingHistory,
    mutate: mutateHistory,
  } = useSWR(
    conversationId ? ['project-agent-handoff', 'history', conversationId] : null,
    async ([, , id]: readonly [string, string, string]) => loadExecutorHistory(id),
    {
      revalidateOnFocus: false,
    }
  );

  useEffect(() => {
    if (!conversationId || !conversationBridge.projectExecutorChanged) {
      return;
    }

    return conversationBridge.projectExecutorChanged.on((event: ProjectExecutorChangedEvent) => {
      if (event.conversationId !== conversationId) {
        return;
      }
      void mutateState();
      void mutateCandidates();
      void mutateHistory();
    });
  }, [conversationId, mutateCandidates, mutateHistory, mutateState]);

  const availableCandidates = useMemo(
    () => (candidates || []).filter((candidate) => candidate.available),
    [candidates]
  );

  const pendingCandidate = useMemo(() => {
    if (!state?.pendingExecutorId) {
      return undefined;
    }
    return (candidates || []).find((candidate) => candidate.id === state.pendingExecutorId);
  }, [candidates, state?.pendingExecutorId]);

  const refresh = useCallback(async () => {
    await Promise.all([mutateState(), mutateCandidates(), mutateHistory()]);
  }, [mutateCandidates, mutateHistory, mutateState]);

  const queueSwitch = useCallback(
    async (targetExecutorId: string): Promise<QueueProjectExecutorSwitchResult> => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }
      if (!conversationBridge.queueProjectExecutorSwitch) {
        throw new Error('Project executor switch is not supported');
      }
      const result = await conversationBridge.queueProjectExecutorSwitch.invoke({
        conversation_id: conversationId,
        targetExecutorId,
      });
      if (!result.success || !result.data) {
        throw new Error(result.msg || 'queue switch failed');
      }
      await refresh();
      return result.data;
    },
    [conversationId, refresh]
  );

  const cancelPendingSwitch = useCallback(async (): Promise<ProjectExecutorState> => {
    if (!conversationId) {
      throw new Error('Conversation is required');
    }
    if (!conversationBridge.cancelPendingProjectExecutorSwitch) {
      throw new Error('Project executor switch is not supported');
    }
    const result = await conversationBridge.cancelPendingProjectExecutorSwitch.invoke({
      conversation_id: conversationId,
    });
    if (!result.success || !result.data) {
      throw new Error(result.msg || 'cancel pending switch failed');
    }
    await refresh();
    return result.data;
  }, [conversationId, refresh]);

  return {
    state,
    candidates: candidates || [],
    availableCandidates,
    history: history || [],
    pendingCandidate,
    isLoading: loadingState || loadingCandidates || loadingHistory,
    queueSwitch,
    cancelPendingSwitch,
    refresh,
  };
};
