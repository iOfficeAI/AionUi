/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  conversationDeleted,
  getConversationRuntimeViewSnapshot,
  hydrateFailed,
  hydrateStarted,
  hydrateSucceeded,
  localSendAccepted,
  localSendFailed,
  localSendStarted,
  localStopAcknowledged,
  localStopRequested,
  resetLocalGate,
  subscribeConversationRuntimeView,
  turnCompleted,
  type ConversationRuntimeView,
  type ConversationRuntimeViewLogEntry,
} from './conversationRuntimeViewStore';

type UseConversationRuntimeViewReturn = {
  view: ConversationRuntimeView;
  hydrated: boolean;
  isProcessing: boolean;
  canSendMessage: boolean;
  activeTurnId: string | null;
  markSendStarted: () => void;
  markSendAccepted: (turn_id: string, runtime: TConversationRuntimeSummary, msg_id?: string) => void;
  markSendFailed: (reason: string) => void;
  markStopRequested: (turn_id: string) => void;
  markStopAcknowledged: (turn_id: string, runtime: TConversationRuntimeSummary) => void;
  resetLocalGate: (reason: string) => void;
};

const normalizeReason = (reason: string): string => reason.trim().slice(0, 200) || 'unknown';

const logConversationRuntimeView = (entry: ConversationRuntimeViewLogEntry): void => {
  const rendererLogger = ipcBridge.application?.writeRendererLog;
  if (!rendererLogger) {
    return;
  }

  void rendererLogger
    .invoke({
      level: entry.level,
      tag: 'conversationRuntimeView',
      message: entry.event,
      data: entry.data,
    })
    .catch(() => {});
};

const flushRuntimeViewLogs = (logs: ConversationRuntimeViewLogEntry[]): void => {
  logs.forEach(logConversationRuntimeView);
};

const getRuntimeOrNull = (runtime: TConversationRuntimeSummary | undefined): TConversationRuntimeSummary | null =>
  runtime ?? null;

export const useConversationRuntimeView = (conversation_id: string): UseConversationRuntimeViewReturn => {
  const getSnapshot = useCallback(() => getConversationRuntimeViewSnapshot(conversation_id), [conversation_id]);
  const view = useSyncExternalStore(subscribeConversationRuntimeView, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!conversation_id) {
      return;
    }

    let cancelled = false;
    flushRuntimeViewLogs(hydrateStarted(conversation_id));

    void getConversationOrNull(conversation_id)
      .then((conversation) => {
        if (cancelled) {
          return;
        }
        flushRuntimeViewLogs(hydrateSucceeded(conversation_id, getRuntimeOrNull(conversation?.runtime)));
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        flushRuntimeViewLogs(hydrateFailed(conversation_id, normalizeReason(reason)));
      });

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  useEffect(() => {
    if (!conversation_id) {
      return;
    }

    const turnCompletedEmitter = ipcBridge.conversation.turnCompleted;
    const listChangedEmitter = ipcBridge.conversation.listChanged;
    if (!turnCompletedEmitter || !listChangedEmitter) {
      return;
    }

    const disposeTurnCompleted = turnCompletedEmitter.on((event) => {
      if (event.session_id !== conversation_id) {
        return;
      }
      flushRuntimeViewLogs(turnCompleted(conversation_id, event.turn_id, event.runtime));
    });

    const disposeListChanged = listChangedEmitter.on((event) => {
      if (event.conversation_id !== conversation_id || event.action !== 'deleted') {
        return;
      }
      flushRuntimeViewLogs(conversationDeleted(conversation_id));
    });

    return () => {
      disposeTurnCompleted();
      disposeListChanged();
    };
  }, [conversation_id]);

  const markSendStarted = useCallback(() => {
    flushRuntimeViewLogs(localSendStarted(conversation_id));
  }, [conversation_id]);

  const markSendAccepted = useCallback(
    (turn_id: string, runtime: TConversationRuntimeSummary, msg_id?: string) => {
      flushRuntimeViewLogs(localSendAccepted(conversation_id, turn_id, runtime, msg_id));
    },
    [conversation_id]
  );

  const markSendFailed = useCallback(
    (reason: string) => {
      flushRuntimeViewLogs(localSendFailed(conversation_id, normalizeReason(reason)));
    },
    [conversation_id]
  );

  const markStopRequested = useCallback(
    (turn_id: string) => {
      flushRuntimeViewLogs(localStopRequested(conversation_id, turn_id));
    },
    [conversation_id]
  );

  const markStopAcknowledged = useCallback(
    (turn_id: string, runtime: TConversationRuntimeSummary) => {
      flushRuntimeViewLogs(localStopAcknowledged(conversation_id, turn_id, runtime));
    },
    [conversation_id]
  );

  const resetLocalRuntimeGate = useCallback(
    (reason: string) => {
      flushRuntimeViewLogs(resetLocalGate(conversation_id, normalizeReason(reason)));
    },
    [conversation_id]
  );

  return {
    view,
    hydrated: view.hydrated,
    isProcessing: view.isProcessing,
    canSendMessage: view.canSendMessage,
    activeTurnId: view.activeTurnId,
    markSendStarted,
    markSendAccepted,
    markSendFailed,
    markStopRequested,
    markStopAcknowledged,
    resetLocalGate: resetLocalRuntimeGate,
  };
};

export const logStreamTerminalObserved = (
  conversation_id: string,
  turn_id: string | undefined,
  platform: 'acp' | 'aionrs',
  stream_type: string
): void => {
  const rendererLogger = ipcBridge.application?.writeRendererLog;
  if (!rendererLogger) {
    return;
  }

  void rendererLogger
    .invoke({
      level: 'info',
      tag: 'conversationRuntimeView',
      message: 'stream_terminal_observed',
      data: {
        conversation_id,
        turn_id,
        platform,
        stream_type,
      },
    })
    .catch(() => {});
};
