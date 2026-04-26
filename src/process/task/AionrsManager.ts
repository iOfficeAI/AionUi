/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { channelEventBus } from '@process/channels/agent/ChannelEventBus';
import { teamEventBus } from '@process/team/teamEventBus';
import type { TProviderWithModel } from '@/common/config/storage';
import { BaseApprovalStore, type IApprovalKey } from '@/common/chat/approval';
import { ToolConfirmationOutcome } from '../agent/gemini/cli/tools/tools';
import BaseAgentManager from './BaseAgentManager';
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
import { mainLog } from '@process/utils/mainLogger';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { skillSuggestWatcher } from '@process/services/cron/SkillSuggestWatcher';

type AionrsApprovalKey = IApprovalKey & {
  action: 'exec' | 'edit' | 'info' | 'mcp';
  identifier?: string;
};

function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
}

export class AionrsApprovalStore extends BaseApprovalStore<AionrsApprovalKey> {
  static createKeysFromConfirmation(action: string, command_type?: string): AionrsApprovalKey[] {
    if (action === 'exec' && command_type) {
      return command_type
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

export type AionrsManagerData = {
  conversation_id: string;
  workspace: string;
  model: TProviderWithModel;
  session_mode?: string;
  yoloMode?: boolean;
};

export class AionrsManager extends BaseAgentManager<AionrsManagerData, string> {
  workspace: string;
  model: TProviderWithModel;
  readonly approvalStore = new AionrsApprovalStore();
  private current_mode: string = 'default';
  private wsCleanup: (() => void) | null = null;

  constructor(data: AionrsManagerData, model: TProviderWithModel) {
    super('aionrs', { ...data, model }, new IpcAgentEventEmitter(), false);
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.current_mode = data.session_mode || 'default';

    this.init();
  }

  override async start() {
    // Agent lifecycle is managed by the backend.
    // The backend creates/reuses AionrsAgentManager on send_message.
  }

  async stop() {
    cronBusyGuard.setProcessing(this.conversation_id, false);
    this.confirmations = [];
    // Actual stop is handled by the renderer via ipcBridge.conversation.stop.invoke()
  }

  async sendMessage(_data: { content: string; msg_id: string; files?: string[] }) {
    cronBusyGuard.setProcessing(this.conversation_id, true);
    this.status = 'pending';
    this._lastActivityAt = Date.now();
    // Actual message sending is handled by AionrsSendBox via ipcBridge.conversation.sendMessage.invoke()
  }

  private emitToEventBuses(message: IResponseMessage): void {
    if (message.type === 'finish' || message.type === 'error') {
      teamEventBus.emit('responseStream', {
        ...message,
        conversation_id: this.conversation_id,
      });
    }
    channelEventBus.emitAgentMessage(this.conversation_id, {
      ...message,
      conversation_id: this.conversation_id,
    });
  }

  init() {
    const cleanup = ipcBridge.conversation.responseStream.on((message: IResponseMessage) => {
      if (this.conversation_id !== message.conversation_id) return;

      if (message.type === 'start') {
        this.status = 'running';
        cronBusyGuard.setProcessing(this.conversation_id, true);
      }

      if (message.type === 'finish' || message.type === 'error') {
        this.status = 'finished';
        cronBusyGuard.setProcessing(this.conversation_id, false);
        skillSuggestWatcher.onFinish(this.conversation_id);
      }

      this.emitToEventBuses(message);
    });

    this.wsCleanup = cleanup;
  }

  confirm(id: string, call_id: string, data: string) {
    if (data === ToolConfirmationOutcome.ProceedAlways) {
      const confirmation = this.confirmations.find((c) => c.call_id === call_id);
      if (confirmation?.action) {
        const keys = AionrsApprovalStore.createKeysFromConfirmation(confirmation.action, confirmation.command_type);
        this.approvalStore.approveAll(keys);
      }
    }

    super.confirm(id, call_id, data);

    const always_allow = data === ToolConfirmationOutcome.ProceedAlways;

    if (data === ToolConfirmationOutcome.Cancel) {
      return;
    }

    void ipcBridge.conversation.confirmation.confirm.invoke({
      conversation_id: this.conversation_id,
      callId: call_id,
      msg_id: '',
      data: { always_allow },
    });
  }

  getMode(): { mode: string; initialized: boolean } {
    return { mode: this.current_mode, initialized: true };
  }

  async setMode(mode: string): Promise<{ success: boolean; data?: { mode: string } }> {
    this.current_mode = mode;
    mainLog('[AionrsManager]', `set_mode: mode=${mode}`);
    return { success: true, data: { mode: this.current_mode } };
  }

  override kill() {
    if (this.wsCleanup) {
      this.wsCleanup();
      this.wsCleanup = null;
    }
    super.kill();
  }
}
