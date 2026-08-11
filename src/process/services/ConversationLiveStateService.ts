/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  ConversationCompletionSource,
  IConversationListChangedEvent,
  IConversationTurnCompletedEvent,
  IResponseMessage,
  ConversationTurnPhase,
  ConversationTurnTimings,
} from '@/common/adapter/ipcBridge';

type ConversationLiveStateReason =
  | 'stream_activity'
  | 'stream_finalizing'
  | 'stream_terminal'
  | 'turn_completed'
  | 'conversation_deleted';

export type ConversationLiveStateSnapshot = {
  isGeneratingLikeUi: boolean;
  updatedAt: number;
  reason: ConversationLiveStateReason;
  turnPhase: ConversationTurnPhase;
  completionSource?: ConversationCompletionSource;
  turnTimings?: ConversationTurnTimings;
};

const shouldIgnoreStreamMessage = (type: string): boolean => {
  return type === 'user_content' || type === 'request_trace' || type === 'finished';
};

const isTerminalAgentStatus = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const { status } = data as { status?: string };
  return status === 'error' || status === 'disconnected';
};

const isTerminalStreamMessage = (message: IResponseMessage): boolean => {
  return (
    message.type === 'finish' ||
    message.type === 'error' ||
    (message.type === 'agent_status' && isTerminalAgentStatus(message.data))
  );
};

export class ConversationLiveStateService {
  private static instance: ConversationLiveStateService | null = null;
  private readonly sessions = new Map<string, ConversationLiveStateSnapshot>();

  static getInstance(): ConversationLiveStateService {
    if (!this.instance) {
      this.instance = new ConversationLiveStateService();
    }

    return this.instance;
  }

  private constructor() {
    ipcBridge.conversation?.responseStream?.on?.((message) => {
      this.handleResponseStream(message);
    });
    ipcBridge.conversation?.turnCompleted?.on?.((event) => {
      this.handleTurnCompleted(event);
    });
    ipcBridge.conversation?.listChanged?.on?.((event) => {
      this.handleConversationListChanged(event);
    });
  }

  getSessionState(sessionId: string): ConversationLiveStateSnapshot | undefined {
    return this.sessions.get(sessionId);
  }

  isGeneratingLikeUi(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isGeneratingLikeUi ?? false;
  }

  listGeneratingSessionIds(): string[] {
    return Array.from(this.sessions.entries())
      .filter(([, snapshot]) => snapshot.isGeneratingLikeUi)
      .map(([sessionId]) => sessionId);
  }

  forgetSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private handleResponseStream(message: IResponseMessage): void {
    const sessionId = message.conversation_id;
    if (!sessionId) {
      return;
    }

    if (isTerminalStreamMessage(message)) {
      if (message.turnPhase === 'finalizing') {
        this.setSessionState(sessionId, {
          isGeneratingLikeUi: false,
          reason: 'stream_finalizing',
          turnPhase: 'finalizing',
          completionSource: message.completionSource,
          turnTimings: message.turnTimings,
        });
        return;
      }

      this.setSessionState(sessionId, {
        isGeneratingLikeUi: false,
        reason: 'stream_terminal',
        turnPhase: message.turnPhase ?? 'delivered',
        completionSource: message.completionSource,
        turnTimings: message.turnTimings,
      });
      return;
    }

    if (shouldIgnoreStreamMessage(message.type)) {
      return;
    }

    this.setSessionState(sessionId, {
      isGeneratingLikeUi: true,
      reason: 'stream_activity',
      turnPhase: 'generating',
    });
  }

  private handleTurnCompleted(event: IConversationTurnCompletedEvent): void {
    this.setSessionState(event.sessionId, {
      isGeneratingLikeUi: false,
      reason: 'turn_completed',
      turnPhase: event.turnPhase ?? 'delivered',
      completionSource: event.completionSource,
      turnTimings: event.turnTimings,
    });
  }

  private handleConversationListChanged(event: IConversationListChangedEvent): void {
    if (event.action !== 'deleted') {
      return;
    }

    this.sessions.delete(event.conversationId);
  }

  private setSessionState(
    sessionId: string,
    nextState: {
      isGeneratingLikeUi: boolean;
      reason: ConversationLiveStateReason;
      turnPhase: ConversationTurnPhase;
      completionSource?: ConversationCompletionSource;
      turnTimings?: ConversationTurnTimings;
    }
  ): void {
    this.sessions.set(sessionId, {
      isGeneratingLikeUi: nextState.isGeneratingLikeUi,
      updatedAt: Date.now(),
      reason: nextState.reason,
      turnPhase: nextState.turnPhase,
      completionSource: nextState.completionSource,
      turnTimings: nextState.turnTimings ? { ...nextState.turnTimings } : undefined,
    });
  }
}

export const conversationLiveStateService = ConversationLiveStateService.getInstance();
