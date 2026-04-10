/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { addEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Whitelist of message types that indicate content generation is in progress.
 * Only these types should trigger the sidebar loading spinner.
 * Using a whitelist (instead of a blacklist) prevents unknown/internal message
 * types (e.g. slash_commands_updated, acp_context_usage) from falsely
 * triggering the generating state.
 */
const isGeneratingStreamMessage = (type: string): boolean => {
  return (
    type === 'content' ||
    type === 'start' ||
    type === 'thought' ||
    type === 'thinking' ||
    type === 'tool_group' ||
    type === 'acp_tool_call' ||
    type === 'acp_permission' ||
    type === 'plan'
  );
};

const isTerminalAgentStatus = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const { status } = data as { status?: string };
  return status === 'error' || status === 'disconnected';
};

const isTerminalStreamMessage = (message: { type: string; data: unknown }): boolean => {
  return (
    message.type === 'finish' ||
    message.type === 'error' ||
    (message.type === 'agent_status' && isTerminalAgentStatus(message.data))
  );
};

const isTerminalTurnState = (state: string): boolean => {
  return state === 'ai_waiting_input' || state === 'error' || state === 'stopped';
};

type ConversationListSyncSnapshot = {
  conversations: TChatConversation[];
  generatingConversationIds: Set<string>;
  completionUnreadConversationIds: Set<string>;
};

const listeners = new Set<() => void>();

let isStoreInitialized = false;
let conversationsState: TChatConversation[] = [];
let generatingConversationIdsState = new Set<string>();
let completionUnreadConversationIdsState = new Set<string>();
let conversationIdsState = new Set<string>();
let activeConversationIdState: string | null = null;
let snapshotState: ConversationListSyncSnapshot = {
  conversations: conversationsState,
  generatingConversationIds: generatingConversationIdsState,
  completionUnreadConversationIds: completionUnreadConversationIdsState,
};

const emitStoreChange = () => {
  snapshotState = {
    conversations: conversationsState,
    generatingConversationIds: generatingConversationIdsState,
    completionUnreadConversationIds: completionUnreadConversationIdsState,
  };
  listeners.forEach((listener) => listener());
};

const subscribeConversationListSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getConversationListSyncSnapshot = (): ConversationListSyncSnapshot => snapshotState;

const refreshConversations = () => {
  void ipcBridge.database.getUserConversations
    .invoke({ page: 0, pageSize: 10000 })
    .then((data) => {
      if (data && Array.isArray(data)) {
        const filteredData = data.filter((conv) => {
          const extra = conv.extra as { isHealthCheck?: boolean; teamId?: string } | undefined;
          return extra?.isHealthCheck !== true && !extra?.teamId;
        });
        conversationsState = filteredData;
        // Use ALL conversation IDs (including team/healthCheck) so the
        // responseStream listener recognises them as known and doesn't
        // trigger an infinite refreshConversations loop.
        conversationIdsState = new Set(data.map((conversation) => conversation.id));
        emitStoreChange();
        return;
      }

      conversationsState = [];
      conversationIdsState = new Set();
      emitStoreChange();
    })
    .catch((error) => {
      console.error('[WorkspaceGroupedHistory] Failed to load conversations:', error);
      conversationsState = [];
      conversationIdsState = new Set();
      emitStoreChange();
    });
};

const markGenerating = (conversationId: string) => {
  if (generatingConversationIdsState.has(conversationId)) {
    return;
  }

  generatingConversationIdsState = new Set(generatingConversationIdsState).add(conversationId);
  emitStoreChange();
};

const clearGenerating = (conversationId: string) => {
  if (!generatingConversationIdsState.has(conversationId)) {
    return;
  }

  const next = new Set(generatingConversationIdsState);
  next.delete(conversationId);
  generatingConversationIdsState = next;
  emitStoreChange();
};

const markCompletionUnread = (conversationId: string) => {
  if (completionUnreadConversationIdsState.has(conversationId)) {
    return;
  }

  completionUnreadConversationIdsState = new Set(completionUnreadConversationIdsState).add(conversationId);
  emitStoreChange();
};

const clearCompletionUnreadState = (conversationId: string) => {
  if (!completionUnreadConversationIdsState.has(conversationId)) {
    return;
  }

  const next = new Set(completionUnreadConversationIdsState);
  next.delete(conversationId);
  completionUnreadConversationIdsState = next;
  emitStoreChange();
};

const setActiveConversationState = (conversationId: string | null) => {
  activeConversationIdState = conversationId;
};

const initializeConversationListSyncStore = () => {
  if (isStoreInitialized) {
    return;
  }

  isStoreInitialized = true;
  refreshConversations();

  addEventListener('chat.history.refresh', refreshConversations);
  ipcBridge.conversation.listChanged.on((event) => {
    if (event.action === 'deleted') {
      clearGenerating(event.conversationId);
      clearCompletionUnreadState(event.conversationId);
    }
    refreshConversations();
  });
  ipcBridge.conversation.responseStream.on((message) => {
    const conversationId = message.conversation_id;
    if (!conversationId) {
      return;
    }

    if (!conversationIdsState.has(conversationId)) {
      refreshConversations();
    }

    if (isTerminalStreamMessage(message)) {
      const wasGenerating = generatingConversationIdsState.has(conversationId);
      if (wasGenerating && activeConversationIdState !== conversationId) {
        markCompletionUnread(conversationId);
      }
      clearGenerating(conversationId);
      return;
    }

    if (isGeneratingStreamMessage(message.type)) {
      markGenerating(conversationId);
    }
  });
  ipcBridge.conversation.turnCompleted.on((event) => {
    if (isTerminalTurnState(event.state) && activeConversationIdState !== event.sessionId) {
      markCompletionUnread(event.sessionId);
    }
    clearGenerating(event.sessionId);
    refreshConversations();
  });
};

export const useConversationListSync = () => {
  useEffect(() => {
    initializeConversationListSyncStore();
  }, []);

  const { conversations, generatingConversationIds, completionUnreadConversationIds } = useSyncExternalStore(
    subscribeConversationListSync,
    getConversationListSyncSnapshot,
    getConversationListSyncSnapshot
  );

  const clearCompletionUnread = useCallback((conversationId: string) => {
    clearCompletionUnreadState(conversationId);
  }, []);

  const setActiveConversation = useCallback((conversationId: string | null) => {
    setActiveConversationState(conversationId);
  }, []);

  const isConversationGenerating = useCallback(
    (conversationId: string) => {
      return generatingConversationIds.has(conversationId);
    },
    [generatingConversationIds]
  );

  const hasCompletionUnread = useCallback(
    (conversationId: string) => {
      return completionUnreadConversationIds.has(conversationId);
    },
    [completionUnreadConversationIds]
  );

  return {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    clearCompletionUnread,
    setActiveConversation,
  };
};
