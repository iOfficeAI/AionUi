/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/task/IpcAgentEventEmitter.ts

import { ipcBridge } from '@/common';
import type { IAgentEventEmitter, AgentMessageEvent } from './IAgentEventEmitter';
import type { IConfirmation } from '@/common/chat/chatLib';

export class IpcAgentEventEmitter implements IAgentEventEmitter {
  emitConfirmationAdd(conversationId: string, data: IConfirmation): void {
    ipcBridge.conversation.confirmation.add.emit({ ...data, conversation_id: conversationId });
  }

  emitConfirmationUpdate(conversationId: string, data: IConfirmation): void {
    ipcBridge.conversation.confirmation.update.emit({ ...data, conversation_id: conversationId });
  }

  emitConfirmationRemove(conversationId: string, confirmationId: string): void {
    ipcBridge.conversation.confirmation.remove.emit({
      conversation_id: conversationId,
      id: confirmationId,
    });
  }

  emitMessage(conversationId: string, event: AgentMessageEvent): void {
    ipcBridge.conversation.responseStream.emit({
      ...event,
      conversation_id: conversationId,
      msg_id: (event.data as any)?.msg_id ?? '',
    });
  }
}
