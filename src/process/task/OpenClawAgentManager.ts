/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenClawAgent, type OpenClawAgentConfig } from '@/agent/openclaw';
import { ipcBridge } from '@/common';
import type { IConfirmation, TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addMessage, addOrUpdateMessage } from '@process/message';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import BaseAgentManager from '@process/task/BaseAgentManager';

export interface OpenClawAgentManagerData {
  conversation_id: string;
  workspace?: string;
  /** Gateway configuration */
  gateway?: {
    host?: string;
    port?: number;
    token?: string;
    password?: string;
    useExternalGateway?: boolean;
    cliPath?: string;
  };
  /** Session key for resume */
  sessionKey?: string;
  /** YOLO mode (auto-approve all permissions) */
  yoloMode?: boolean;
}

class OpenClawAgentManager extends BaseAgentManager<OpenClawAgentManagerData> {
  workspace?: string;
  agent!: OpenClawAgent;
  bootstrap: Promise<OpenClawAgent>;
  private isFirstMessage: boolean = true;
  private options: OpenClawAgentManagerData;

  constructor(data: OpenClawAgentManagerData) {
    super('openclaw-gateway', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data;

    this.bootstrap = this.initAgent(data);
  }

  private async initAgent(data: OpenClawAgentManagerData): Promise<OpenClawAgent> {
    const config: OpenClawAgentConfig = {
      id: data.conversation_id,
      workingDir: data.workspace || process.cwd(),
      gateway: data.gateway
        ? {
            ...data.gateway,
            port: data.gateway.port ?? 18789,
          }
        : undefined,
      extra: {
        workspace: data.workspace,
        sessionKey: data.sessionKey,
        yoloMode: data.yoloMode,
      },
      onStreamEvent: (message) => this.handleStreamEvent(message),
      onSignalEvent: (message) => this.handleSignalEvent(message),
      onSessionKeyUpdate: (sessionKey) => this.handleSessionKeyUpdate(sessionKey),
    };

    this.agent = new OpenClawAgent(config);

    try {
      await this.agent.start();
      return this.agent;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(`Failed to start OpenClaw agent: ${errorMsg}`);
      throw error;
    }
  }

  private handleStreamEvent(message: IResponseMessage): void {
    const msg = { ...message, conversation_id: this.conversation_id };

    // Persist messages to database
    const tMessage = transformMessage(msg);
    if (tMessage) {
      // Use addOrUpdateMessage for streaming content to merge deltas with same msg_id
      // Use addMessage for non-streaming messages that should be inserted as-is
      if (msg.type === 'content' && msg.msg_id) {
        addOrUpdateMessage(this.conversation_id, tMessage);
      } else {
        addMessage(this.conversation_id, tMessage);
      }
    }

    // Emit to frontend
    ipcBridge.openclawConversation.responseStream.emit(msg);
  }

  private handleSignalEvent(message: IResponseMessage): void {
    const msg = { ...message, conversation_id: this.conversation_id };

    // Handle permission requests
    if (msg.type === 'acp_permission') {
      const permissionData = msg.data as {
        sessionId: string;
        toolCall: { toolCallId: string; title?: string; kind?: string; rawInput?: Record<string, unknown> };
        options: Array<{ optionId: string; name: string; kind: string }>;
      };

      // Create confirmation for UI
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

    // Handle finish event
    if (msg.type === 'finish') {
      cronBusyGuard.setProcessing(this.conversation_id, false);
    }

    // Emit signal events to frontend
    ipcBridge.openclawConversation.responseStream.emit(msg);
  }

  private handleSessionKeyUpdate(sessionKey: string): void {
    // Store updated session key for resume
    // This could be persisted to conversation extra data
    console.log('[OpenClawAgentManager] Session key updated:', sessionKey);
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }) {
    cronBusyGuard.setProcessing(this.conversation_id, true);
    try {
      await this.bootstrap;

      // Save user message to chat history
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

      // Send message to agent
      const result = await this.agent.sendMessage({
        content: data.content,
        files: data.files,
        msg_id: data.msg_id,
      });

      return result;
    } catch (error) {
      cronBusyGuard.setProcessing(this.conversation_id, false);

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(`Failed to send message: ${errorMsg}`);
      throw error;
    }
  }

  async confirm(id: string, callId: string, data: string) {
    super.confirm(id, callId, data);
    await this.bootstrap;

    // Send confirmation to agent
    await this.agent.confirmMessage({
      confirmKey: data,
      callId,
    });
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

    ipcBridge.openclawConversation.responseStream.emit(message);
  }

  stop() {
    return this.agent?.stop?.() ?? Promise.resolve();
  }

  kill() {
    try {
      this.agent?.kill?.();
    } finally {
      super.kill();
    }
  }

  getDiagnostics() {
    return {
      workspace: this.workspace,
      conversation_id: this.conversation_id,
      isConnected: this.agent?.isConnected ?? false,
      hasActiveSession: this.agent?.hasActiveSession ?? false,
      sessionKey: this.agent?.currentSessionKey ?? null,
    };
  }
}

export default OpenClawAgentManager;
