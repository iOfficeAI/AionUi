/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { CronMessageMeta, IConfirmation, TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { getDatabase } from '@process/services/database';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import BaseAgentManager from '@process/task/BaseAgentManager';
import { IpcAgentEventEmitter } from '@process/task/IpcAgentEventEmitter';
import { prepareFirstMessageWithSkillsIndex } from '@process/task/agentUtils';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';
import { CodexAppServerClient } from './CodexAppServerClient';
import { CodexThreadSession } from './CodexThreadSession';

export type CodexNativeAgentManagerData = {
  conversation_id: string;
  workspace?: string;
  cliPath?: string;
  appServerCommand?: string;
  appServerArgs?: string[];
  codexThreadId?: string;
  sessionMode?: string;
  codexModel?: string;
  enabledSkills?: string[];
  presetContext?: string;
  yoloMode?: boolean;
};

export class CodexNativeAgentManager extends BaseAgentManager<CodexNativeAgentManagerData, string> {
  workspace: string;
  private readonly options: CodexNativeAgentManagerData;
  private readonly client: CodexAppServerClient;
  private readonly session: CodexThreadSession;
  private started = false;
  private startPromise: Promise<void> | undefined;
  private readonly unsubscribeClientFailure: () => void;
  private isFirstMessage = true;
  private activeSendToken: symbol | undefined;

  constructor(data: CodexNativeAgentManagerData) {
    super('codex', data, new IpcAgentEventEmitter(), false);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace || process.cwd();
    this.options = data;
    this.status = 'pending';
    this.client = new CodexAppServerClient({
      command: data.appServerCommand || data.cliPath || 'codex',
      args: data.appServerCommand ? data.appServerArgs || [] : ['app-server', ...(data.appServerArgs || [])],
      cwd: this.workspace,
    });
    this.unsubscribeClientFailure = this.client.onFailure(() => {
      this.started = false;
      this.startPromise = undefined;
    });
    this.session = new CodexThreadSession({
      client: this.client,
      options: {
        conversationId: this.conversation_id,
        workspace: this.workspace,
        threadId: data.codexThreadId,
        approvalPolicy: data.yoloMode ? 'never' : 'on-request',
        sandboxPolicy: 'workspace-write',
        model: data.codexModel,
      },
      emitMessage: (message, persist) => this.emitAndPersistMessage(message, persist),
      emitConfirmation: (confirmation) => this.addConfirmation(confirmation),
      persistConversationExtra: (extra) => this.persistConversationExtra(extra),
    });
  }

  async sendMessage(data: {
    content: string;
    files?: string[];
    msg_id?: string;
    cronMeta?: CronMessageMeta;
  }): Promise<void> {
    if (this.activeSendToken) {
      const error = new Error('Codex native agent is already processing a message');
      this.emitAndPersistMessage(
        {
          type: 'error',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id || uuid(),
          data: error.message,
        },
        true
      );
      throw error;
    }

    const sendToken = Symbol('codex-native-send');
    this.activeSendToken = sendToken;
    this._lastActivityAt = Date.now();
    this.status = 'running';
    cronBusyGuard.setProcessing(this.conversation_id, true);
    try {
      await this.ensureStarted();
      const msgId = data.msg_id || uuid();
      if (data.content) {
        const userMessage: TMessage = {
          id: msgId,
          msg_id: msgId,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: { content: data.content, ...(data.cronMeta && { cronMeta: data.cronMeta }) },
          createdAt: Date.now(),
        };
        addMessage(this.conversation_id, userMessage);
      }

      const contentToSend = data.content?.includes(AIONUI_FILES_MARKER)
        ? data.content.split(AIONUI_FILES_MARKER)[0].trimEnd()
        : data.content;
      const content = this.isFirstMessage
        ? (
            await prepareFirstMessageWithSkillsIndex(contentToSend, {
              presetContext: this.options.presetContext,
              enabledSkills: this.options.enabledSkills,
            })
          ).content
        : contentToSend;
      this.isFirstMessage = false;
      await this.session.startTurn({ content, msgId, files: data.files });
    } catch (error) {
      this.emitAndPersistMessage(
        {
          type: 'error',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id || uuid(),
          data: error instanceof Error ? error.message : String(error),
        },
        true
      );
      throw error;
    } finally {
      if (this.activeSendToken === sendToken) {
        this.activeSendToken = undefined;
        this.status = 'finished';
        cronBusyGuard.setProcessing(this.conversation_id, false);
      }
    }
  }

  async stop(): Promise<void> {
    await this.session.interrupt();
    this.status = 'finished';
  }

  confirm(msgId: string, callId: string, data: string): void {
    super.confirm(msgId, callId, data);
  }

  kill(): void {
    this.session.dispose();
    this.unsubscribeClientFailure();
    void this.client.dispose();
    super.kill();
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return;
    if (!this.startPromise) {
      this.startPromise = (async () => {
        await this.client.start();
        await this.session.start();
        this.started = true;
      })();
    }

    try {
      await this.startPromise;
    } finally {
      if (!this.started) {
        this.startPromise = undefined;
      }
    }
  }

  private emitAndPersistMessage(message: IResponseMessage, persist: boolean): void {
    const normalized = { ...message, conversation_id: this.conversation_id };
    if (persist) {
      const transformed = transformMessage(normalized);
      if (transformed) {
        if (transformed.type === 'agent_status' || transformed.type === 'codex_tool_call') {
          addOrUpdateMessage(this.conversation_id, transformed);
        } else {
          addMessage(this.conversation_id, transformed);
        }
      }
    }
    ipcBridge.conversation.responseStream.emit(normalized);
  }

  private async persistConversationExtra(extra: Record<string, unknown>): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (!result.success || !result.data) return;
      db.updateConversation(this.conversation_id, {
        extra: { ...result.data.extra, ...extra },
      });
    } catch {
      // Unit tests and early startup can run without an initialized DB; the live app persists when available.
    }
  }
}

export default CodexNativeAgentManager;
