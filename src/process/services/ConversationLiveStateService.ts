/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  IConversationListChangedEvent,
  IConversationTurnCompletedEvent,
  IResponseMessage,
} from '@/common/adapter/ipcBridge';

type ConversationLiveStateReason = 'stream_activity' | 'stream_terminal' | 'turn_completed' | 'conversation_deleted';

export type ConversationLiveStateSnapshot = {
  isGeneratingLikeUi: boolean;
  updatedAt: number;
  reason: ConversationLiveStateReason;
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
      this.setSessionState(sessionId, false, 'stream_terminal');
      return;
    }

    if (shouldIgnoreStreamMessage(message.type)) {
      return;
    }

    this.setSessionState(sessionId, true, 'stream_activity');
  }

  private handleTurnCompleted(event: IConversationTurnCompletedEvent): void {
    this.setSessionState(event.sessionId, false, 'turn_completed');
  }

  private handleConversationListChanged(event: IConversationListChangedEvent): void {
    if (event.action !== 'deleted') {
      return;
    }

    this.sessions.delete(event.conversationId);
  }

  private setSessionState(sessionId: string, isGeneratingLikeUi: boolean, reason: ConversationLiveStateReason): void {
    this.sessions.set(sessionId, {
      isGeneratingLikeUi,
      updatedAt: Date.now(),
      reason,
    });
  }
}

export const conversationLiveStateService = ConversationLiveStateService.getInstance();
