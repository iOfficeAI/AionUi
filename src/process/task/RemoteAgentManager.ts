/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteAgentCore } from '@process/agent/remote';
import { channelEventBus } from '@process/channels/agent/ChannelEventBus';
import { ipcBridge } from '@/common';
import type { IConfirmation, TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { uuid } from '@/common/utils';
import { getDatabase } from '@process/services/database';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import BaseAgentManager from '@process/task/BaseAgentManager';
import { IpcAgentEventEmitter } from '@process/task/IpcAgentEventEmitter';

export interface RemoteAgentManagerData {
  conversation_id: string;
  workspace?: string;
  remoteAgentId: string;
  sessionKey?: string;
  yoloMode?: boolean;
}

class RemoteAgentManager extends BaseAgentManager<RemoteAgentManagerData> {
  core!: RemoteAgentCore;
  bootstrap: Promise<RemoteAgentCore>;
  private options: RemoteAgentManagerData;

  constructor(data: RemoteAgentManagerData) {
    super('remote', data, new IpcAgentEventEmitter(), false);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace ?? '';
    this.options = data;
    this.status = 'pending';

    this.bootstrap = this.initCore(data);
  }

  private async initCore(data: RemoteAgentManagerData): Promise<RemoteAgentCore> {
    const db = await getDatabase();
    const remoteConfig = db.getRemoteAgent(data.remoteAgentId);
    if (!remoteConfig) {
      throw new Error(`Remote agent config not found: ${data.remoteAgentId}`);
    }

    this.core = new RemoteAgentCore({
      conversationId: data.conversation_id,
      remoteConfig,
      sessionKey: data.sessionKey,
      onStreamEvent: (msg) => this.handleStreamEvent(msg),
      onSignalEvent: (msg) => this.handleSignalEvent(msg),
      onSessionKeyUpdate: (key) => this.handleSessionKeyUpdate(key),
    });

    try {
      await this.core.start();
      this.updateRemoteAgentStatus(data.remoteAgentId, 'connected');
      return this.core;
    } catch (error) {
      this.updateRemoteAgentStatus(data.remoteAgentId, 'error');
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(`Failed to start remote agent: ${errorMsg}`);
      throw error;
    }
  }

  private handleStreamEvent(message: IResponseMessage): void {
    const msg = { ...message, conversation_id: this.conversation_id };

    const contentTypes = ['content', 'agent_status', 'acp_tool_call', 'plan'];
    if (contentTypes.includes(msg.type)) {
      this.status = 'finished';
    }

    const tMessage = transformMessage(msg);
    if (tMessage) {
      if ((msg.type === 'content' || msg.type === 'agent_status') && msg.msg_id) {
        addOrUpdateMessage(this.conversation_id, tMessage);
      } else {
        addMessage(this.conversation_id, tMessage);
      }
    }

    ipcBridge.conversation.responseStream.emit(msg);
    channelEventBus.emitAgentMessage(this.conversation_id, msg);
  }

  private handleSignalEvent(message: IResponseMessage): void {
    const msg = { ...message, conversation_id: this.conversation_id };

    if (msg.type === 'acp_permission') {
      const permissionData = msg.data as {
        sessionId: string;
        toolCall: {
          toolCallId: string;
          title?: string;
          kind?: string;
          rawInput?: Record<string, unknown>;
        };
        options: Array<{ optionId: string; name: string; kind: string }>;
      };

      const confirmation: IConfirmation = {
        id: permissionData.toolCall.toolCallId,
        callId: permissionData.toolCall.toolCallId,
        title: permissionData.toolCall.title || 'Permission Required',
        description: JSON.stringify(permissionData.toolCall.rawInput || {}),
        options: permissionData.options.map((opt) => ({
          label: opt.name,
          value: opt.optionId,
        })),
      };

      this.addConfirmation(confirmation);
      return;
    }

    if (msg.type === 'finish') {
      cronBusyGuard.setProcessing(this.conversation_id, false);
    }

    ipcBridge.conversation.responseStream.emit(msg);
    channelEventBus.emitAgentMessage(this.conversation_id, msg);
  }

  private handleSessionKeyUpdate(sessionKey: string): void {
    this.saveSessionKey(sessionKey);
  }

  private async saveSessionKey(sessionKey: string): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'remote') {
        const conversation = result.data;
        const updatedExtra = {
          ...conversation.extra,
          sessionKey,
        };
        db.updateConversation(this.conversation_id, {
          extra: updatedExtra,
        } as Partial<typeof conversation>);
      }
    } catch (error) {
      console.error('[RemoteAgentManager] Failed to save session key:', error);
    }
  }

  private async updateRemoteAgentStatus(remoteAgentId: string, status: 'connected' | 'error'): Promise<void> {
    try {
      const db = await getDatabase();
      db.updateRemoteAgent(remoteAgentId, {
        status,
        ...(status === 'connected' ? { last_connected_at: Date.now() } : {}),
      });
    } catch {
      // Non-critical — status is a cached display hint
    }
  }

  async sendMessage(data: { content: string; agentContent?: string; files?: string[]; msg_id?: string }) {
    cronBusyGuard.setProcessing(this.conversation_id, true);
    this.status = 'running';
    try {
      await this.bootstrap;

      if (data.msg_id && data.content) {
        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: { content: data.content },
          createdAt: Date.now(),
        };
        addMessage(this.conversation_id, userMessage);
      }

      const result = await this.core.sendMessage({
        content: data.agentContent || data.content,
        files: data.files,
      });

      return result;
    } catch (error) {
      cronBusyGuard.setProcessing(this.conversation_id, false);
      this.status = 'finished';

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(`Failed to send message: ${errorMsg}`);
      throw error;
    }
  }

  async confirm(id: string, callId: string, data: string) {
    super.confirm(id, callId, data);
    await this.bootstrap;
    await this.core.confirmMessage({ confirmKey: data, callId });
  }

  private emitErrorMessage(error: string): void {
    const message: IResponseMessage = {
      type: 'error',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: error,
    };

    const tMessage = transformMessage(message);
    if (tMessage) {
      addMessage(this.conversation_id, tMessage);
    }

    ipcBridge.conversation.responseStream.emit(message);
  }

  async ensureYoloMode(): Promise<boolean> {
    return !!this.options.yoloMode;
  }

  stop() {
    return this.core?.stop?.() ?? Promise.resolve();
  }

  kill() {
    try {
      this.core?.kill?.();
    } finally {
      super.kill();
    }
  }
}

export default RemoteAgentManager;
