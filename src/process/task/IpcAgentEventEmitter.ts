/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/task/IpcAgentEventEmitter.ts

import { ipcBridge } from '@/common';
import type { IAgentEventEmitter, AgentMessageEvent } from './IAgentEventEmitter';
import type { IConfirmation } from '@/common/chat/chatLib';

// Main-process hook for confirmation events (used by petConfirmManager).
// buildEmitter.on() only works in renderer, so main-process subscribers use this hook.
type ConfirmHook = {
  onAdd: (conversationId: string, data: IConfirmation) => void;
  onUpdate: (conversationId: string, data: IConfirmation) => void;
  onRemove: (conversationId: string, confirmationId: string) => void;
};

let _confirmHook: ConfirmHook | null = null;

export function setConfirmHook(hook: ConfirmHook | null): void {
  _confirmHook = hook;
}

export class IpcAgentEventEmitter implements IAgentEventEmitter {
  emitConfirmationAdd(conversationId: string, data: IConfirmation): void {
    ipcBridge.conversation.confirmation.add.emit({ ...data, conversation_id: conversationId });
    _confirmHook?.onAdd(conversationId, data);
  }

  emitConfirmationUpdate(conversationId: string, data: IConfirmation): void {
    ipcBridge.conversation.confirmation.update.emit({ ...data, conversation_id: conversationId });
    _confirmHook?.onUpdate(conversationId, data);
  }

  emitConfirmationRemove(conversationId: string, confirmationId: string): void {
    ipcBridge.conversation.confirmation.remove.emit({
      conversation_id: conversationId,
      id: confirmationId,
    });
    _confirmHook?.onRemove(conversationId, confirmationId);
  }

  emitMessage(conversationId: string, event: AgentMessageEvent): void {
    ipcBridge.conversation.responseStream.emit({
      ...event,
      conversation_id: conversationId,
      msg_id: (event.data as any)?.msg_id ?? '',
    });
  }
}
