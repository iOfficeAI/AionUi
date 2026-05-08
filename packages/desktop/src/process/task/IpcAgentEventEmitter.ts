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
  onAdd: (conversation_id: string, data: IConfirmation) => void;
  onUpdate: (conversation_id: string, data: IConfirmation) => void;
  onRemove: (conversation_id: string, confirmationId: string) => void;
};

let _confirmHook: ConfirmHook | null = null;

export function setConfirmHook(hook: ConfirmHook | null): void {
  _confirmHook = hook;
}

export class IpcAgentEventEmitter implements IAgentEventEmitter {
  emitConfirmationAdd(conversation_id: string, data: IConfirmation): void {
    ipcBridge.conversation.confirmation.add.emit({ ...data, conversation_id: conversation_id });
    _confirmHook?.onAdd(conversation_id, data);
  }

  emitConfirmationUpdate(conversation_id: string, data: IConfirmation): void {
    ipcBridge.conversation.confirmation.update.emit({ ...data, conversation_id: conversation_id });
    _confirmHook?.onUpdate(conversation_id, data);
  }

  emitConfirmationRemove(conversation_id: string, confirmationId: string): void {
    ipcBridge.conversation.confirmation.remove.emit({
      conversation_id: conversation_id,
      id: confirmationId,
    });
    _confirmHook?.onRemove(conversation_id, confirmationId);
  }

  emitMessage(conversation_id: string, event: AgentMessageEvent): void {
    ipcBridge.conversation.responseStream.emit({
      ...event,
      conversation_id: conversation_id,
      msg_id: (event.data as any)?.msg_id ?? '',
    });
  }
}
