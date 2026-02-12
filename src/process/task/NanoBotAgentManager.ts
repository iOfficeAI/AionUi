/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NanobotAgent, type NanobotAgentConfig } from '@/agent/nanobot';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addMessage, addOrUpdateMessage } from '@process/message';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import BaseAgentManager from '@process/task/BaseAgentManager';

export interface NanoBotAgentManagerData {
  conversation_id: string;
  workspace?: string;
  customWorkspace?: boolean;
  enabledSkills?: string[];
  presetAssistantId?: string;
  yoloMode?: boolean;
}

class NanoBotAgentManager extends BaseAgentManager<NanoBotAgentManagerData> {
  workspace?: string;
  agent!: NanobotAgent;
  bootstrap: Promise<NanobotAgent>;

  constructor(data: NanoBotAgentManagerData) {
    super('nanobot', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;

    this.bootstrap = this.initAgent(data);
  }

  private async initAgent(data: NanoBotAgentManagerData): Promise<NanobotAgent> {
    const config: NanobotAgentConfig = {
      id: data.conversation_id,
      workingDir: data.workspace || process.cwd(),
      onStreamEvent: (message) => this.handleStreamEvent(message),
      onSignalEvent: (message) => this.handleSignalEvent(message),
    };

    this.agent = new NanobotAgent(config);

    try {
      await this.agent.start();
      return this.agent;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(`Failed to start Nanobot agent: ${errorMsg}`);
      throw error;
    }
  }

  private handleStreamEvent(message: IResponseMessage): void {
    const msg = { ...message, conversation_id: this.conversation_id };

    // Persist messages to database
    const tMessage = transformMessage(msg);
    if (tMessage) {
      if (msg.type === 'content' && msg.msg_id) {
        addOrUpdateMessage(this.conversation_id, tMessage);
      } else {
        addMessage(this.conversation_id, tMessage);
      }
    }

    // Emit to frontend via unified conversation stream
    ipcBridge.conversation.responseStream.emit(msg);
  }

  private handleSignalEvent(message: IResponseMessage): void {
    const msg = { ...message, conversation_id: this.conversation_id };

    // Handle finish event
    if (msg.type === 'finish') {
      cronBusyGuard.setProcessing(this.conversation_id, false);
    }

    // Emit signal events to frontend
    ipcBridge.conversation.responseStream.emit(msg);
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }) {
    cronBusyGuard.setProcessing(this.conversation_id, true);
    try {
      await this.bootstrap;

      // Save user message to chat history (frontend handles display directly)
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

      // Fire-and-forget: nanobot CLI blocks until completion, so we must not
      // await it here. The IPC response needs to return immediately so the
      // frontend can display the user message. Response and finish events
      // are emitted asynchronously via handleStreamEvent/handleSignalEvent.
      this.agent.sendMessage({ content: data.content }).catch((error) => {
        cronBusyGuard.setProcessing(this.conversation_id, false);
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.emitErrorMessage(`Failed to send message: ${errorMsg}`);
      });

      return { success: true, data: null as null };
    } catch (error) {
      cronBusyGuard.setProcessing(this.conversation_id, false);

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(`Failed to send message: ${errorMsg}`);
      throw error;
    }
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
}

export default NanoBotAgentManager;
