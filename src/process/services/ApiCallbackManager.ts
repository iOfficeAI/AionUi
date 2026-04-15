/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import { ConversationTurnCompletionService } from '@process/services/ConversationTurnCompletionService';
import { getDatabase } from '@process/services/database';
import { CallbackService } from '@/webserver/services/CallbackService';

/**
 * API Callback Manager
 * Listens to unified conversation turn completion events and triggers HTTP callbacks
 */
export class ApiCallbackManager {
  private static instance: ApiCallbackManager | null = null;
  private unsubscribe: (() => void) | null = null;

  private constructor() {
    this.initialize();
  }

  static getInstance(): ApiCallbackManager {
    if (!this.instance) {
      this.instance = new ApiCallbackManager();
    }
    return this.instance;
  }

  private initialize(): void {
    console.log('[ApiCallbackManager] Initializing...');

    // Subscribe through the in-process completion service.
    // Bridge emitters broadcast to renderer/web clients, but they do not loop back
    // into the main process, so outbound callbacks need a local listener here.
    this.unsubscribe = ConversationTurnCompletionService.getInstance().onTurnCompleted(
      async (event: IConversationTurnCompletedEvent) => {
        try {
          await this.handleTurnCompleted(event);
        } catch (error) {
          console.error('[ApiCallbackManager] Error handling turn completion:', error);
        }
      }
    );

    console.log('[ApiCallbackManager] Initialized successfully');
  }

  private async handleTurnCompleted(event: IConversationTurnCompletedEvent): Promise<void> {
    console.log(
      `[ApiCallbackManager] Received turn completion for ${event.sessionId} (state=${event.state}, status=${event.status})`
    );
    const db = await getDatabase();

    const configResult = db.getApiConfig();
    const callbackUrl = configResult.data?.callbackUrl?.trim();
    if (!configResult.success || !configResult.data?.callbackEnabled || !callbackUrl) {
      console.log('[ApiCallbackManager] Callback skipped because callback is disabled or URL is empty');
      return;
    }

    // Outbound conversation callbacks do not depend on the local HTTP API toggle.
    const callbackConfig =
      callbackUrl === configResult.data.callbackUrl ? configResult.data : { ...configResult.data, callbackUrl };

    const messagesResult = db.getConversationMessages(event.sessionId, 0, 100);
    const messages = messagesResult.data || [];
    const hasLastMessage = messages.some((message) => message.id === event.lastMessage.id);
    const conversationHistory = hasLastMessage ? messages : [...messages, event.lastMessage];

    const variables = {
      conversationHistory,
      sessionId: event.sessionId,
      workspace: event.workspace,
      model: event.model,
      lastMessage: event.lastMessage,
      status: event.status,
      state: event.state,
      detail: event.detail,
      canSendMessage: event.canSendMessage,
      runtime: event.runtime,
      turnPhase: event.turnPhase,
      completionSource: event.completionSource,
      turnTimings: event.turnTimings,
    };

    const callbackSentAt = Date.now();
    const callbackResult = await CallbackService.sendCallback(callbackConfig, variables);

    if (callbackResult.success) {
      const callbackSuccessAt = Date.now();
      console.log(
        `[ApiCallbackManager] Callback completed for ${event.sessionId} (sentAt=${callbackSentAt}, successAt=${callbackSuccessAt})`
      );
      return;
    }

    console.error(
      `[ApiCallbackManager] Callback failed for ${event.sessionId} after send attempt at ${callbackSentAt}:`,
      callbackResult.error
    );
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    console.log('[ApiCallbackManager] Destroyed');
  }

  static destroyInstance(): void {
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
  }
}
