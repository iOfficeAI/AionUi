/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { teamEventBus } from '@process/task/teamEventBus';
import BaseAgentManager from '@process/task/BaseAgentManager';
import { IpcAgentEventEmitter } from '@process/task/IpcAgentEventEmitter';
import { conversationBusyGuard } from '@process/task/ConversationBusyGuard';

export interface OpenClawAgentManagerData {
  conversation_id: string;
  workspace?: string;
  yoloMode?: boolean;
}

/**
 * Lightweight proxy that delegates agent lifecycle to the Rust backend.
 *
 * The backend `OpenClawAgentManager` owns the WebSocket connection to the
 * OpenClaw Gateway. This frontend manager only tracks status by listening
 * to `message.stream` events pushed over the backend WebSocket.
 *
 * Message sending is handled by OpenClawSendBox →
 *   ipcBridge.conversation.sendMessage.invoke() →
 *   POST /api/conversations/{id}/messages →
 *   backend send_message() → OpenClawAgentManager.send_message()
 */
class OpenClawAgentManager extends BaseAgentManager<OpenClawAgentManagerData> {
  private wsCleanup: (() => void) | null = null;

  constructor(data: OpenClawAgentManagerData) {
    super('openclaw-gateway', data, new IpcAgentEventEmitter(), false);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace ?? '';

    this.subscribeToBackend();
  }

  override async start() {
    // Agent lifecycle is managed by the backend.
    // The backend creates/reuses OpenClawAgentManager on warmup/send_message.
  }

  async stop() {
    conversationBusyGuard.setProcessing(this.conversation_id, false);
    this.confirmations = [];
    // Actual stop is handled by the renderer via ipcBridge.conversation.stop.invoke()
  }

  async sendMessage(_data: { content: string; msg_id?: string; files?: string[] }) {
    conversationBusyGuard.setProcessing(this.conversation_id, true);
    this.status = 'pending';
    this._lastActivityAt = Date.now();
    // Actual message sending is handled by OpenClawSendBox via
    // ipcBridge.conversation.sendMessage.invoke() → POST /api/conversations/{id}/messages
  }

  private emitToEventBuses(message: IResponseMessage): void {
    if (message.type === 'finish' || message.type === 'error') {
      teamEventBus.emit('responseStream', {
        ...message,
        conversation_id: this.conversation_id,
      });
    }
  }

  private subscribeToBackend() {
    const cleanup = ipcBridge.conversation.responseStream.on((message: IResponseMessage) => {
      if (this.conversation_id !== message.conversation_id) return;

      if (message.type === 'start') {
        this.status = 'running';
        conversationBusyGuard.setProcessing(this.conversation_id, true);
      }

      if (message.type === 'finish' || message.type === 'error') {
        this.status = 'finished';
        conversationBusyGuard.setProcessing(this.conversation_id, false);
      }

      this.emitToEventBuses(message);
    });

    this.wsCleanup = cleanup;
  }

  confirm(id: string, call_id: string, data: string) {
    super.confirm(id, call_id, data);

    if (data === 'cancel') {
      return;
    }

    const always_allow = data === 'proceed_always' || data === 'allow_always';

    void ipcBridge.conversation.confirmation.confirm.invoke({
      conversation_id: this.conversation_id,
      call_id,
      msg_id: '',
      data: { value: data },
      always_allow,
    });
  }

  getDiagnostics() {
    return {
      workspace: this.workspace,
      conversation_id: this.conversation_id,
    };
  }

  override kill() {
    if (this.wsCleanup) {
      this.wsCleanup();
      this.wsCleanup = null;
    }
    super.kill();
  }
}

export default OpenClawAgentManager;
