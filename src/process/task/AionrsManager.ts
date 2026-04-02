/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolGroup, TMessage, IMessageText } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import { BaseApprovalStore, type IApprovalKey } from '@/common/chat/approval';
import { ToolConfirmationOutcome } from '../agent/gemini/cli/tools/tools';
import { getDatabase } from '@process/services/database';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';
import { uuid } from '@/common/utils';
import BaseAgentManager from './BaseAgentManager';
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
import { mainError } from '@process/utils/mainLogger';

// Aionrs-specific approval key — reuses same pattern as GeminiApprovalStore
type AionrsApprovalKey = IApprovalKey & {
  action: 'exec' | 'edit' | 'info' | 'mcp';
  identifier?: string;
};

function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
}

export class AionrsApprovalStore extends BaseApprovalStore<AionrsApprovalKey> {
  static createKeysFromConfirmation(action: string, commandType?: string): AionrsApprovalKey[] {
    if (action === 'exec' && commandType) {
      return commandType
        .split(',')
        .map((cmd) => cmd.trim())
        .filter(Boolean)
        .filter(isValidCommandName)
        .map((cmd) => ({ action: 'exec' as const, identifier: cmd }));
    }
    if (action === 'edit' || action === 'info' || action === 'mcp') {
      return [{ action: action as AionrsApprovalKey['action'] }];
    }
    return [];
  }
}

type AionrsManagerData = {
  workspace: string;
  proxy?: string;
  model: TProviderWithModel;
  conversation_id: string;
  yoloMode?: boolean;
  presetRules?: string;
  maxTokens?: number;
  maxTurns?: number;
  sessionMode?: string;
  sessionId?: string;
  resume?: string;
};

export class AionrsManager extends BaseAgentManager<AionrsManagerData, string> {
  workspace: string;
  model: TProviderWithModel;
  readonly approvalStore = new AionrsApprovalStore();
  private currentMode: string = 'default';

  constructor(data: AionrsManagerData, model: TProviderWithModel) {
    super('aionrs', { ...data, model }, new IpcAgentEventEmitter());
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.currentMode = data.sessionMode || 'default';

    // Start the worker bootstrap
    void this.start().catch(() => {});
  }

  /**
   * Determine new vs resume session, then start the worker.
   * If the conversation already has messages in the DB, pass --resume;
   * otherwise pass --session-id for a new session.
   */
  override async start() {
    try {
      const db = await getDatabase();
      const result = db.getConversationMessages(this.conversation_id, 0, 1);
      const hasMessages = (result.data?.length ?? 0) > 0;

      const sessionArgs = hasMessages ? { resume: this.conversation_id } : { sessionId: this.conversation_id };

      return super.start({ ...this.data.data, ...sessionArgs } as AionrsManagerData);
    } catch {
      // Fallback: start as new session if DB check fails
      return super.start({ ...this.data.data, sessionId: this.conversation_id } as AionrsManagerData);
    }
  }

  private async injectHistoryFromDatabase(): Promise<void> {
    try {
      const result = (await getDatabase()).getConversationMessages(this.conversation_id, 0, 10000);
      const data = (result.data || []) as TMessage[];
      const lines = data
        .filter((m): m is IMessageText => m.type === 'text')
        .slice(-20)
        .map((m) => `${m.position === 'right' ? 'User' : 'Assistant'}: ${m.content.content || ''}`);
      const text = lines.join('\n').slice(-4000);
      if (text) {
        await this.postMessagePromise('init.history', { text });
      }
    } catch {
      // ignore history injection errors
    }
  }

  async stop() {
    // Inject history BEFORE stopping so the command reaches the running process
    await this.injectHistoryFromDatabase();
    await super.stop();
  }

  async sendMessage(data: { input: string; msg_id: string; files?: string[] }) {
    const message: TMessage = {
      id: data.msg_id,
      type: 'text',
      position: 'right',
      conversation_id: this.conversation_id,
      content: { content: data.input },
    };
    addMessage(this.conversation_id, message);
    try {
      (await getDatabase()).updateConversation(this.conversation_id, {});
    } catch {
      // Conversation might not exist in DB yet
    }
    this.status = 'pending';
    return super.sendMessage(data);
  }

  /**
   * Check if a confirmation should be auto-approved based on current mode.
   */
  private tryAutoApprove(content: IMessageToolGroup['content'][number]): boolean {
    const type = content.confirmationDetails?.type;

    if (this.currentMode === 'yolo') {
      void this.postMessagePromise(content.callId, ToolConfirmationOutcome.ProceedOnce);
      return true;
    }
    if (this.currentMode === 'autoEdit') {
      if (type === 'edit' || type === 'info') {
        void this.postMessagePromise(content.callId, ToolConfirmationOutcome.ProceedOnce);
        return true;
      }
    }
    return false;
  }

  private handleConformationMessage(message: IMessageToolGroup) {
    const confirmingTools = message.content.filter((c) => c.status === 'Confirming');

    for (const content of confirmingTools) {
      // Check mode-based auto-approval
      if (this.tryAutoApprove(content)) continue;

      // Check approval store ("always allow" memory)
      const action = content.confirmationDetails?.type ?? 'info';
      const commandType =
        action === 'exec' ? (content.confirmationDetails as { rootCommand?: string })?.rootCommand : undefined;
      const keys = AionrsApprovalStore.createKeysFromConfirmation(action, commandType);
      if (keys.length > 0 && this.approvalStore.allApproved(keys)) {
        void this.postMessagePromise(content.callId, ToolConfirmationOutcome.ProceedOnce);
        continue;
      }

      // Show confirmation dialog to user
      const options = [
        { label: 'messages.confirmation.yesAllowOnce', value: ToolConfirmationOutcome.ProceedOnce },
        { label: 'messages.confirmation.yesAllowAlways', value: ToolConfirmationOutcome.ProceedAlways },
        { label: 'messages.confirmation.no', value: ToolConfirmationOutcome.Cancel },
      ];

      this.addConfirmation({
        title: content.confirmationDetails?.title || content.name || '',
        id: content.callId,
        action,
        description: content.description || '',
        callId: content.callId,
        options,
        commandType,
      });
    }
  }

  init() {
    super.init();
    this.on('aionrs.message', (data) => {
      const contentTypes = ['content', 'tool_group'];
      if (contentTypes.includes(data.type)) {
        this.status = 'finished';
      }

      if (data.type === 'start') {
        this.status = 'running';
        ipcBridge.conversation.responseStream.emit({
          type: 'request_trace',
          conversation_id: this.conversation_id,
          msg_id: uuid(),
          data: {
            agentType: 'aionrs' as const,
            provider: this.model.name,
            modelId: this.model.useModel,
            baseUrl: this.model.baseUrl,
            platform: this.model.platform,
            timestamp: Date.now(),
          },
        });
      }

      data.conversation_id = this.conversation_id;

      // Transform and persist message (skip transient UI state)
      const skipTransformTypes = ['thought', 'finished', 'start', 'finish'];
      if (!skipTransformTypes.includes(data.type)) {
        const tMessage = transformMessage(data as IResponseMessage);
        if (tMessage) {
          addOrUpdateMessage(this.conversation_id, tMessage, 'aionrs');
          if (tMessage.type === 'tool_group') {
            this.handleConformationMessage(tMessage);
          }
        }
      }

      ipcBridge.conversation.responseStream.emit(data);
    });
  }

  getMode(): { mode: string; initialized: boolean } {
    return { mode: this.currentMode, initialized: true };
  }

  async setMode(mode: string): Promise<{ success: boolean; data?: { mode: string } }> {
    this.currentMode = mode;
    this.saveSessionMode(mode);
    return { success: true, data: { mode: this.currentMode } };
  }

  private async saveSessionMode(mode: string): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'aionrs') {
        const conversation = result.data;
        db.updateConversation(this.conversation_id, {
          extra: { ...conversation.extra, sessionMode: mode },
        } as Partial<typeof conversation>);
      }
    } catch (error) {
      mainError('[AionrsManager]', 'Failed to save session mode', error);
    }
  }

  confirm(id: string, callId: string, data: string) {
    // Store "always allow" in approval store
    if (data === ToolConfirmationOutcome.ProceedAlways) {
      const confirmation = this.confirmations.find((c) => c.callId === callId);
      if (confirmation?.action) {
        const keys = AionrsApprovalStore.createKeysFromConfirmation(confirmation.action, confirmation.commandType);
        this.approvalStore.approveAll(keys);
      }
    }

    super.confirm(id, callId, data);
    return this.postMessagePromise(callId, data);
  }
}
