/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { getDatabaseSync } from '@process/services/database';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { conversationLiveStateService } from '@process/services/ConversationLiveStateService';
import { getConversationRuntimeTask } from '@process/services/ConversationRuntimeService';
import { showNotification } from '@process/bridge/notificationBridge';
import i18n, { i18nReady } from '@process/services/i18n';
import { flushConversationMessages } from '@process/utils/message';

export type ConversationStatusValue = 'pending' | 'running' | 'finished';
export type ConversationRuntimeState =
  | 'ai_generating'
  | 'ai_waiting_input'
  | 'ai_waiting_confirmation'
  | 'initializing'
  | 'stopped'
  | 'error'
  | 'unknown';
export type ConversationStatusCategory = 'generating' | 'waiting' | 'stopped' | 'error' | 'unknown';

type StatusMessage = {
  id?: string;
  type?: string;
  content?: unknown;
  status?: string | null;
  createdAt?: number;
  position?: string | null;
};

type ConversationStatusInput = {
  status?: ConversationStatusValue | undefined;
};

export type ConversationStatusSnapshotOptions = {
  touchTask?: boolean;
};

export interface ConversationStatusSnapshot {
  sessionId: string;
  conversation: TChatConversation;
  status: ConversationStatusValue;
  state: ConversationRuntimeState;
  detail: string;
  canSendMessage: boolean;
  runtime: {
    hasTask: boolean;
    taskStatus?: ConversationStatusValue;
    isProcessing: boolean;
    pendingConfirmations: number;
    dbStatus?: ConversationStatusValue;
    lastActiveAt?: number;
    processingStale: boolean;
  };
  lastMessage: StatusMessage | null;
}

const RETRY_COUNT = 20;
const RETRY_DELAY_MS = 100;
const EMITTED_KEY_TTL_MS = 60 * 60 * 1000;
const STALE_PROCESSING_AFTER_MS = 2 * 60 * 1000;

const hasScheduledTaskMarker = (conversation: TChatConversation): boolean => {
  return typeof conversation.extra?.cronJobId === 'string' && conversation.extra.cronJobId.length > 0;
};

const getConversationNotificationTitle = (conversation: TChatConversation): string => {
  return conversation.name?.trim() || i18n.t('cron.notification.taskComplete');
};

const isErrorMessage = (message: StatusMessage | null): boolean => {
  if (!message) return false;
  if (message.status === 'error') return true;

  if (message.type === 'tips' && message.content && typeof message.content === 'object') {
    const tipsContent = message.content as { type?: string };
    return tipsContent.type === 'error';
  }

  return false;
};

export const extractWorkspaceFromConversation = (conversation: TChatConversation): string => {
  return conversation.extra?.workspace || '';
};

export const extractModelInfoFromConversation = (
  conversation: TChatConversation
): IConversationTurnCompletedEvent['model'] => {
  const conversationWithModel = conversation as TChatConversation & {
    model?: {
      platform?: string;
      name?: string;
      useModel?: string;
    };
  };
  const extra = (conversation.extra || {}) as Record<string, unknown>;

  if (conversationWithModel.model) {
    return {
      platform: conversationWithModel.model.platform || '',
      name: conversationWithModel.model.name || '',
      useModel: conversationWithModel.model.useModel || '',
    };
  }

  return {
    platform: conversation.type || (typeof extra.backend === 'string' ? extra.backend : ''),
    name:
      typeof extra.agentName === 'string' ? extra.agentName : typeof extra.backend === 'string' ? extra.backend : '',
    useModel:
      typeof extra.currentModelId === 'string'
        ? extra.currentModelId
        : typeof extra.codexModel === 'string'
          ? extra.codexModel
          : '',
  };
};

export const formatStatusLastMessage = (
  lastMessage: StatusMessage | null
): IConversationTurnCompletedEvent['lastMessage'] | undefined => {
  if (!lastMessage) {
    return undefined;
  }

  return {
    id: lastMessage.id,
    type: lastMessage.type,
    content: lastMessage.content,
    status: lastMessage.status ?? null,
    createdAt: lastMessage.createdAt || Date.now(),
  };
};

export const getConversationStatusCategory = (state: ConversationRuntimeState): ConversationStatusCategory => {
  if (state === 'ai_generating' || state === 'initializing') {
    return 'generating';
  }

  if (state === 'ai_waiting_input' || state === 'ai_waiting_confirmation') {
    return 'waiting';
  }

  if (state === 'stopped') {
    return 'stopped';
  }

  if (state === 'error') {
    return 'error';
  }

  return 'unknown';
};

export const isConversationStatusWorking = (state: ConversationRuntimeState): boolean =>
  state === 'ai_generating' || state === 'initializing';

const getConversationTask = (sessionId: string, options: ConversationStatusSnapshotOptions = {}) => {
  const touchTask = options.touchTask ?? true;
  return getConversationRuntimeTask(sessionId, {
    touchLegacyTask: touchTask,
  }).task;
};

export const deriveConversationRuntimeStatus = (
  sessionId: string,
  conversation: ConversationStatusInput,
  lastMessage: StatusMessage | null,
  options: ConversationStatusSnapshotOptions = {}
) => {
  const task = getConversationTask(sessionId, options) as
    | {
        status?: ConversationStatusValue;
        getConfirmations?: () => unknown[];
      }
    | undefined;

  const hasTask = !!task;
  const taskStatus = task?.status;
  const isGeneratingLikeUi = conversationLiveStateService.isGeneratingLikeUi(sessionId);
  const rawIsProcessing = cronBusyGuard.isProcessing(sessionId);
  const lastActiveAt = cronBusyGuard.getLastActiveAt(sessionId);
  const pendingConfirmations = typeof task?.getConfirmations === 'function' ? task.getConfirmations().length : 0;
  const dbStatus = conversation.status;
  const processingStale =
    rawIsProcessing &&
    taskStatus === 'finished' &&
    pendingConfirmations === 0 &&
    lastMessage?.position !== 'right' &&
    typeof lastActiveAt === 'number' &&
    Date.now() - lastActiveAt > STALE_PROCESSING_AFTER_MS;
  const isProcessing = processingStale ? false : rawIsProcessing;
  const runtime = {
    hasTask,
    taskStatus,
    isProcessing,
    pendingConfirmations,
    dbStatus,
    lastActiveAt,
    processingStale,
  };

  if (isGeneratingLikeUi) {
    return {
      status: 'running' as ConversationStatusValue,
      state: 'ai_generating' as ConversationRuntimeState,
      detail: 'AI is generating response',
      canSendMessage: false,
      runtime,
    };
  }

  if (isErrorMessage(lastMessage)) {
    return {
      status: 'finished' as ConversationStatusValue,
      state: 'error' as ConversationRuntimeState,
      detail: 'Last response ended with an error',
      canSendMessage: true,
      runtime,
    };
  }

  if (pendingConfirmations > 0) {
    return {
      status: 'running' as ConversationStatusValue,
      state: 'ai_waiting_confirmation' as ConversationRuntimeState,
      detail: 'Waiting for tool confirmation',
      canSendMessage: false,
      runtime,
    };
  }

  if (isProcessing || taskStatus === 'running') {
    return {
      status: 'running' as ConversationStatusValue,
      state: 'ai_generating' as ConversationRuntimeState,
      detail: 'AI is generating response',
      canSendMessage: false,
      runtime,
    };
  }

  if (taskStatus === 'pending') {
    if (lastMessage?.position === 'right') {
      return {
        status: 'running' as ConversationStatusValue,
        state: 'ai_generating' as ConversationRuntimeState,
        detail: 'AI request accepted and initializing',
        canSendMessage: false,
        runtime,
      };
    }

    return {
      status: 'pending' as ConversationStatusValue,
      state: 'initializing' as ConversationRuntimeState,
      detail: 'Conversation task is initializing',
      canSendMessage: true,
      runtime,
    };
  }

  if (dbStatus === 'finished' && !hasTask) {
    return {
      status: 'finished' as ConversationStatusValue,
      state: 'stopped' as ConversationRuntimeState,
      detail: 'Conversation is stopped',
      canSendMessage: true,
      runtime,
    };
  }

  return {
    status: 'finished' as ConversationStatusValue,
    state: 'ai_waiting_input' as ConversationRuntimeState,
    detail: 'AI is waiting for input',
    canSendMessage: true,
    runtime,
  };
};

export const getConversationStatusSnapshot = (
  sessionId: string,
  options: ConversationStatusSnapshotOptions = {}
): ConversationStatusSnapshot | null => {
  const db = getDatabaseSync();
  const convResult = db.getConversation(sessionId);
  if (!convResult.success || !convResult.data) {
    return null;
  }

  const messagesResult = db.getConversationMessages(sessionId, 0, 1, 'DESC');
  const lastMessage = (messagesResult.data?.[0] as StatusMessage | undefined) || null;
  const resolvedStatus = deriveConversationRuntimeStatus(sessionId, convResult.data, lastMessage, options);

  return {
    sessionId,
    conversation: convResult.data,
    status: resolvedStatus.status,
    state: resolvedStatus.state,
    detail: resolvedStatus.detail,
    canSendMessage: resolvedStatus.canSendMessage,
    runtime: resolvedStatus.runtime,
    lastMessage,
  };
};

export const getReadOnlyConversationStatusSnapshot = (sessionId: string): ConversationStatusSnapshot | null =>
  getConversationStatusSnapshot(sessionId, { touchTask: false });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type ConversationTurnCompletedListener = (event: IConversationTurnCompletedEvent) => Promise<void> | void;

export class ConversationTurnCompletionService {
  private static instance: ConversationTurnCompletionService | null = null;
  private readonly emittedKeys = new Map<string, { key: string; timestamp: number }>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly listeners = new Set<ConversationTurnCompletedListener>();

  static getInstance(): ConversationTurnCompletionService {
    if (!this.instance) {
      this.instance = new ConversationTurnCompletionService();
    }
    return this.instance;
  }

  notifyPotentialCompletion(sessionId: string): Promise<void> {
    const existing = this.inFlight.get(sessionId);
    if (existing) {
      return existing;
    }

    const task = this.settleAndEmit(sessionId).finally(() => {
      if (this.inFlight.get(sessionId) === task) {
        this.inFlight.delete(sessionId);
      }
    });

    this.inFlight.set(sessionId, task);
    return task;
  }

  forgetSession(sessionId: string): void {
    this.emittedKeys.delete(sessionId);
    this.inFlight.delete(sessionId);
  }

  onTurnCompleted(listener: ConversationTurnCompletedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getDebugState(): {
    emittedKeyCount: number;
    inFlightCount: number;
    emittedKeys: Array<{ sessionId: string; key: string; timestamp: number }>;
    inFlightSessionIds: string[];
  } {
    return {
      emittedKeyCount: this.emittedKeys.size,
      inFlightCount: this.inFlight.size,
      emittedKeys: Array.from(this.emittedKeys.entries()).map(([sessionId, emitted]) => ({
        sessionId,
        key: emitted.key,
        timestamp: emitted.timestamp,
      })),
      inFlightSessionIds: Array.from(this.inFlight.keys()),
    };
  }

  private async settleAndEmit(sessionId: string): Promise<void> {
    await flushConversationMessages(sessionId);

    for (let attempt = 0; attempt < RETRY_COUNT; attempt += 1) {
      const snapshot = getConversationStatusSnapshot(sessionId);
      if (!snapshot) {
        return;
      }

      if (this.isEligible(snapshot)) {
        const event = this.buildEvent(snapshot);
        const emittedKey = `${event.lastMessage.id || event.lastMessage.createdAt}:${event.state}`;
        const existing = this.emittedKeys.get(sessionId);
        if (existing?.key === emittedKey) {
          return;
        }

        this.pruneEmittedKeys();
        this.emittedKeys.set(sessionId, { key: emittedKey, timestamp: Date.now() });
        this.emitTurnCompleted(event);
        await this.showCompletionNotification(snapshot.conversation, event);
        return;
      }

      await sleep(RETRY_DELAY_MS);
    }
  }

  private isEligible(snapshot: ConversationStatusSnapshot): boolean {
    if (!snapshot.lastMessage) {
      return false;
    }

    if (!snapshot.canSendMessage) {
      return false;
    }

    if (!['ai_waiting_input', 'error', 'stopped'].includes(snapshot.state)) {
      return false;
    }

    if (snapshot.lastMessage.position === 'right') {
      return false;
    }

    return true;
  }

  private buildEvent(snapshot: ConversationStatusSnapshot): IConversationTurnCompletedEvent {
    const formattedLastMessage = formatStatusLastMessage(snapshot.lastMessage);
    if (!formattedLastMessage) {
      throw new Error('Conversation turn completion event requires lastMessage');
    }

    const liveState = conversationLiveStateService.getSessionState(snapshot.sessionId);
    const deliveredAt = Date.now();

    return {
      sessionId: snapshot.sessionId,
      status: snapshot.status,
      state: snapshot.state,
      detail: snapshot.detail,
      canSendMessage: snapshot.canSendMessage,
      runtime: snapshot.runtime,
      workspace: extractWorkspaceFromConversation(snapshot.conversation),
      model: extractModelInfoFromConversation(snapshot.conversation),
      turnPhase: 'delivered',
      completionSource: liveState?.completionSource,
      turnTimings: {
        ...liveState?.turnTimings,
        deliveredAt,
      },
      lastMessage: formattedLastMessage,
    };
  }

  private emitTurnCompleted(event: IConversationTurnCompletedEvent): void {
    ipcBridge.conversation.turnCompleted.emit(event);

    for (const listener of this.listeners) {
      try {
        void Promise.resolve(listener(event)).catch((error) => {
          console.error('[ConversationTurnCompletionService] turnCompleted listener failed:', error);
        });
      } catch (error) {
        console.error('[ConversationTurnCompletionService] turnCompleted listener failed:', error);
      }
    }
  }

  private async showCompletionNotification(
    conversation: TChatConversation,
    event: IConversationTurnCompletedEvent
  ): Promise<void> {
    if (hasScheduledTaskMarker(conversation)) {
      return;
    }

    try {
      await i18nReady;
      await showNotification({
        title: getConversationNotificationTitle(conversation),
        body: i18n.t('cron.notification.taskDone'),
        conversationId: event.sessionId,
      });
    } catch (error) {
      console.error('[ConversationTurnCompletionService] completion notification failed:', error);
    }
  }

  private pruneEmittedKeys(now: number = Date.now()): void {
    for (const [sessionId, emitted] of this.emittedKeys) {
      if (now - emitted.timestamp > EMITTED_KEY_TTL_MS) {
        this.emittedKeys.delete(sessionId);
      }
    }
  }
}
