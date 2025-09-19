/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexMcpAgent } from '@/agent/codex';
import type { NetworkError } from '@/agent/codex/CodexMcpConnection';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addMessage } from '../message';
import BaseAgentManager from './BaseAgentManager';
import fs from 'fs/promises';
import path from 'path';
import { t } from 'i18next';
import { CodexEventHandler } from './codex/CodexEventHandler';
import type { CodexAgentManagerData, CodexAgentEvent } from '@/common/codexTypes';

class CodexAgentManager extends BaseAgentManager<CodexAgentManagerData> {
  workspace?: string;
  agent: CodexMcpAgent;
  bootstrap: Promise<CodexMcpAgent>;
  private eventHandler: CodexEventHandler;

  constructor(data: CodexAgentManagerData) {
    super('codex', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.eventHandler = new CodexEventHandler(data.conversation_id);
    this.initAgent(data);
  }

  private initAgent(data: CodexAgentManagerData) {
    this.agent = new CodexMcpAgent({
      id: data.conversation_id,
      cliPath: data.cliPath,
      workingDir: data.workspace || process.cwd(),
      onEvent: (evt) => this.eventHandler.handleEvent(evt as CodexAgentEvent),
      onNetworkError: (error) => this.handleNetworkError(error),
    });
    this.emitStatus('connecting', t('codex.status.connecting'));
    this.bootstrap = this.agent
      .start()
      .then(async () => {
        this.emitStatus('connected', t('codex.status.connected'));
        await this.restorePermissionState();
        this.emitStatus('ready', t('codex.status.session_active'));
        return this.agent;
      })
      .catch((e) => {
        this.emitStatus('error', t('codex.status.error_connect', { error: e.message }));
        throw e;
      });
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }) {
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
          content: {
            content: data.content,
          },
          createdAt: Date.now(),
        };
        addMessage(this.conversation_id, userMessage);

        const userResponseMessage: IResponseMessage = {
          type: 'user_content',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id,
          data: userMessage.content.content,
        };
        ipcBridge.codexConversation.responseStream.emit(userResponseMessage);
      }

      return await this.agent.sendPrompt(data.content);
    } catch (e) {
      const message: IResponseMessage = {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: data.msg_id || uuid(),
        data: e instanceof Error ? e.message : String(e),
      };
      addMessage(this.conversation_id, transformMessage(message));
      ipcBridge.codexConversation.responseStream.emit(message);
      throw e;
    }
  }

  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }) {
    await this.bootstrap;
    this.eventHandler.getToolHandlers().removePendingConfirmation(data.callId);

    // Apply patch changes if available
    const changes = this.eventHandler.getToolHandlers().getPatchChanges(data.callId);
    if (changes && data.confirmKey === 'proceed') {
      await this.applyPatchChanges(data.callId, changes);
    }

    return this.agent.resolvePermission(data.callId, data.confirmKey === 'proceed');
  }

  private async applyPatchChanges(_callId: string, changes: Record<string, any>): Promise<void> {
    try {
      // Apply file changes
      for (const [filePath, change] of Object.entries(changes)) {
        if (typeof change === 'object' && change !== null) {
          const fullPath = path.resolve(this.workspace || process.cwd(), filePath);

          if (change.action === 'create' || change.action === 'write') {
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(fullPath, change.content || '', 'utf-8');
          } else if (change.action === 'delete') {
            try {
              await fs.unlink(fullPath);
            } catch (err) {
              console.warn(`Failed to delete file: ${fullPath}`, err);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to apply patch changes:', error);
      throw error;
    }
  }

  private handleNetworkError(error: NetworkError): void {
    // Emit network error as status message
    this.emitStatus('error', `Network Error: ${error.suggestedAction}`);

    // Create a user-friendly error message based on error type
    let userMessage = '';
    let recoveryActions: string[] = [];

    switch (error.type) {
      case 'cloudflare_blocked':
        userMessage = t('codex.network.cloudflare_blocked_title', { service: 'Codex' });
        recoveryActions = t('codex.network.recovery_actions.cloudflare_blocked', { returnObjects: true }) as string[];
        break;

      case 'network_timeout':
        userMessage = t('codex.network.network_timeout_title');
        recoveryActions = t('codex.network.recovery_actions.network_timeout', { returnObjects: true }) as string[];
        break;

      case 'connection_refused':
        userMessage = t('codex.network.connection_refused_title');
        recoveryActions = t('codex.network.recovery_actions.connection_refused', { returnObjects: true }) as string[];
        break;

      default:
        userMessage = t('codex.network.unknown_error_title');
        recoveryActions = t('codex.network.recovery_actions.unknown', { returnObjects: true }) as string[];
    }

    // Create detailed error message for UI
    const detailedMessage = `${userMessage}\n\n${t('codex.network.recovery_suggestions')}\n${recoveryActions.join('\n')}\n\n${t('codex.network.technical_info')}\n- ${t('codex.network.error_type')}：${error.type}\n- ${t('codex.network.retry_count')}：${error.retryCount}\n- ${t('codex.network.error_details')}：${error.originalError.substring(0, 200)}${error.originalError.length > 200 ? '...' : ''}`;

    // Emit network error message to UI
    const networkErrorMessage: IResponseMessage = {
      type: 'network_error',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        error: error,
        title: userMessage,
        message: detailedMessage,
        recoveryActions: recoveryActions,
        quickSwitchContent: t('codex.network.quick_switch_content'),
      },
    };

    // Add to message history and emit to UI
    addMessage(this.conversation_id, transformMessage(networkErrorMessage));
    ipcBridge.codexConversation.responseStream.emit(networkErrorMessage);
  }

  private async restorePermissionState(): Promise<void> {
    // This method would restore any pending permission states from storage
    // Implementation would depend on how permissions are persisted
    console.log('Restoring permission state for conversation:', this.conversation_id);
  }

  private emitStatus(status: string, message: string) {
    const statusMessage: IResponseMessage = {
      type: 'status',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: { status, message },
    };
    ipcBridge.codexConversation.responseStream.emit(statusMessage);
  }

  cleanup() {
    this.eventHandler.cleanup();
    this.agent?.stop?.();
  }
}

export default CodexAgentManager;
