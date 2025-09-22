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
import { CodexEventHandler } from '../agent/codex/CodexEventHandler';
import { CodexSessionManager } from '../agent/codex/CodexSessionManager';
import { CodexFileOperationHandler } from '../agent/codex/CodexFileOperationHandler';
import type { CodexAgentManagerData, CodexAgentEvent } from '@/common/codexTypes';

class CodexAgentManager extends BaseAgentManager<CodexAgentManagerData> {
  workspace?: string;
  agent: CodexMcpAgent;
  bootstrap: Promise<CodexMcpAgent>;
  private eventHandler: CodexEventHandler;
  private sessionManager: CodexSessionManager;
  private fileOperationHandler: CodexFileOperationHandler;

  constructor(data: CodexAgentManagerData) {
    super('codex', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;

    // 初始化各个管理器 - 参考 ACP 的架构
    console.log('🏗️ [CodexAgentManager] Initializing managers...');
    this.eventHandler = new CodexEventHandler(data.conversation_id);
    this.sessionManager = new CodexSessionManager({
      conversation_id: data.conversation_id,
      cliPath: data.cliPath,
      workingDir: data.workspace || process.cwd(),
    });
    this.fileOperationHandler = new CodexFileOperationHandler(data.conversation_id, data.workspace);

    this.initAgent(data);
  }

  private initAgent(data: CodexAgentManagerData) {
    console.log('🔧 [CodexAgentManager] Initializing agent with config:', {
      conversation_id: data.conversation_id,
      cliPath: data.cliPath,
      workingDir: data.workspace || process.cwd(),
    });

    this.agent = new CodexMcpAgent({
      id: data.conversation_id,
      cliPath: data.cliPath,
      workingDir: data.workspace || process.cwd(),
      onEvent: (evt) => {
        console.log('📨 [CodexAgentManager] Received event:', evt.type, evt.data ? '(with data)' : '(no data)');
        console.log('🔍 [CodexAgentManager] Event details:', JSON.stringify(evt, null, 2));
        try {
          this.eventHandler.handleEvent(evt as CodexAgentEvent);
          console.log('✅ [CodexAgentManager] Event handled successfully');
        } catch (error) {
          console.error('❌ [CodexAgentManager] Event handling failed:', error);
        }
      },
      onNetworkError: (error) => {
        console.error('🌐 [CodexAgentManager] Network error:', error);
        this.handleNetworkError(error);
      },
    });

    console.log('🔌 [CodexAgentManager] Agent created, starting bootstrap...');

    // 使用 SessionManager 来管理连接状态 - 参考 ACP 的模式
    this.bootstrap = this.startWithSessionManagement()
      .then(async () => {
        console.log('🎯 [CodexAgentManager] Agent ready for messages');
        return this.agent;
      })
      .catch((e) => {
        console.error('❌ [CodexAgentManager] Agent start failed:', e);
        this.sessionManager.emitSessionEvent('bootstrap_failed', { error: e.message });
        throw e;
      });
  }

  /**
   * 使用会话管理器启动 - 参考 ACP 的启动流程
   */
  private async startWithSessionManagement(): Promise<void> {
    console.log('🌟 [CodexAgentManager] Starting with session management...');

    // 1. 启动会话管理器
    await this.sessionManager.startSession();

    // 2. 启动 MCP Agent
    await this.agent.start();

    // 3. 执行认证和会话创建
    await this.performPostConnectionSetup();

    // 4. 恢复权限状态
    await this.restorePermissionState();

    console.log('✅ [CodexAgentManager] Session management startup completed');
  }

  /**
   * 连接后设置 - 参考 ACP 的认证和会话创建
   */
  private async performPostConnectionSetup(): Promise<void> {
    console.log('⚙️ [CodexAgentManager] Performing post-connection setup...');

    try {
      // 输出连接诊断信息
      const diagnostics = this.getDiagnostics();
      console.log('🔍 [CodexAgentManager] Connection diagnostics before setup:', diagnostics);

      // MCP 初始化握手 - 现在有内置重试机制
      const result = await this.agent.newSession(this.workspace);
      console.log('✅ [CodexAgentManager] Session created with ID:', result.sessionId);

      this.sessionManager.emitSessionEvent('session_created', {
        workspace: this.workspace,
        agent_type: 'codex',
        sessionId: result.sessionId,
      });
    } catch (error) {
      console.error('❌ [CodexAgentManager] Post-connection setup failed:', error);

      // 输出更详细的诊断信息
      const diagnostics = this.getDiagnostics();
      console.error('🔍 [CodexAgentManager] Connection diagnostics after failure:', diagnostics);

      // 提供具体的错误信息和建议
      const errorMessage = error instanceof Error ? error.message : String(error);
      let suggestions: string[] = [];

      if (errorMessage.includes('timed out')) {
        suggestions = ['Check if Codex CLI is installed: run "codex --version"', 'Verify authentication: run "codex auth status"', 'Check network connectivity', 'Try restarting the application'];
      } else if (errorMessage.includes('command not found')) {
        suggestions = ['Install Codex CLI: https://codex.com/install', 'Add Codex to your PATH environment variable', 'Restart your terminal/application after installation'];
      } else if (errorMessage.includes('authentication')) {
        suggestions = ['Run "codex auth" to authenticate with your account', 'Check if your authentication token is valid', 'Try logging out and logging back in'];
      }

      console.log('💡 [CodexAgentManager] Suggested troubleshooting steps:', suggestions);

      // 即使设置失败，也尝试继续运行，因为连接可能仍然有效
      console.log('🔄 [CodexAgentManager] Attempting to continue despite setup failure...');
      this.sessionManager.emitSessionEvent('session_partial', {
        workspace: this.workspace,
        agent_type: 'codex',
        error: errorMessage,
        diagnostics,
        suggestions,
      });

      // 不抛出错误，让应用程序继续运行
      return;
    }
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }) {
    console.log('🚀 [CodexAgentManager] sendMessage called with:', {
      content: data.content.substring(0, 100) + (data.content.length > 100 ? '...' : ''),
      files: data.files,
      msg_id: data.msg_id,
      conversation_id: this.conversation_id,
    });

    try {
      console.log('⏳ [CodexAgentManager] Waiting for bootstrap...');
      await this.bootstrap;
      console.log('✅ [CodexAgentManager] Bootstrap completed');

      // Save user message to chat history only (renderer already inserts right-hand bubble)
      if (data.msg_id && data.content) {
        console.log('💾 [CodexAgentManager] Saving user message to history');
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
        console.log('✅ [CodexAgentManager] User message saved');
      }

      console.log('📤 [CodexAgentManager] Sending prompt to agent...');

      // 处理文件引用 - 参考 ACP 的文件引用处理
      const processedContent = this.fileOperationHandler.processFileReferences(data.content, data.files);
      if (processedContent !== data.content) {
        console.log('🔄 [CodexAgentManager] Processed file references in content');
      }

      const result = await this.agent.sendPrompt(processedContent);
      console.log('✅ [CodexAgentManager] Prompt sent successfully');
      return result;
    } catch (e) {
      console.error('❌ [CodexAgentManager] Error in sendMessage:', e);
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
    console.log('✅ [CodexAgentManager] confirmMessage called with:', {
      confirmKey: data.confirmKey,
      msg_id: data.msg_id,
      callId: data.callId,
      conversation_id: this.conversation_id,
    });

    await this.bootstrap;
    console.log('🔧 [CodexAgentManager] Removing pending confirmation for callId:', data.callId);
    this.eventHandler.getToolHandlers().removePendingConfirmation(data.callId);

    // Map confirmKey to decision
    const key = String(data.confirmKey || '').toLowerCase();
    const isApproved = key.includes('allow') || key.includes('proceed') || key.includes('approved');
    const decision: 'approved' | 'approved_for_session' | 'denied' | 'abort' = key.includes('approved_for_session') || key.includes('allow_always') ? 'approved_for_session' : isApproved ? 'approved' : key.includes('abort') ? 'abort' : 'denied';

    // Apply patch changes if available and approved
    const changes = this.eventHandler.getToolHandlers().getPatchChanges(data.callId);
    if (changes && isApproved) {
      console.log('📝 [CodexAgentManager] Applying patch changes for callId:', data.callId, 'changes:', Object.keys(changes));
      await this.applyPatchChanges(data.callId, changes);
    } else {
      console.log('⏭️ [CodexAgentManager] No changes to apply or action was not approved:', {
        hasChanges: !!changes,
        isApproved,
        confirmKey: data.confirmKey,
      });
    }

    // Normalize call id back to server's codex_call_id
    const origCallId = data.callId.startsWith('patch_') ? data.callId.substring(6) : data.callId.startsWith('elicitation_') ? data.callId.substring(12) : data.callId.startsWith('exec_') ? data.callId.substring(5) : data.callId;

    // Respond to elicitation (server expects JSON-RPC response)
    console.log('📨 [CodexAgentManager] Responding elicitation with decision:', decision, 'origCallId:', origCallId);
    (this.agent as any).respondElicitation?.(origCallId, decision);

    // Also resolve local pause gate to resume queued requests
    this.agent.resolvePermission(origCallId, isApproved);
    return { success: true } as any;
  }

  private async applyPatchChanges(callId: string, changes: Record<string, any>): Promise<void> {
    console.log('📦 [CodexAgentManager] Applying patch changes using file operation handler...');

    try {
      // 使用文件操作处理器来应用更改 - 参考 ACP 的批量操作
      await this.fileOperationHandler.applyBatchChanges(changes);

      // 发送成功事件
      this.sessionManager.emitSessionEvent('patch_applied', {
        callId,
        changeCount: Object.keys(changes).length,
        files: Object.keys(changes),
      });

      console.log('✅ [CodexAgentManager] Patch changes applied successfully');
    } catch (error) {
      console.error('❌ [CodexAgentManager] Failed to apply patch changes:', error);

      // 发送失败事件
      this.sessionManager.emitSessionEvent('patch_failed', {
        callId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  private handleNetworkError(error: NetworkError): void {
    console.error('🌐❌ [CodexAgentManager] Handling network error:', {
      type: error.type,
      retryCount: error.retryCount,
      suggestedAction: error.suggestedAction,
      originalError: error.originalError.substring(0, 200),
    });

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

    console.log('📋 [CodexAgentManager] Generated user message:', userMessage);
    console.log('🔧 [CodexAgentManager] Recovery actions:', recoveryActions);

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

    console.log('📤 [CodexAgentManager] Emitting network error message to UI');
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
    console.log('📊 [CodexAgentManager] Emitting status:', {
      status,
      message,
      conversation_id: this.conversation_id,
    });

    const statusMessage: IResponseMessage = {
      type: 'acp_status',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        backend: 'codex' as any,
        status: status as any,
        message,
      },
    };
    ipcBridge.codexConversation.responseStream.emit(statusMessage);
    console.log('✅ [CodexAgentManager] Status message emitted');
  }

  getDiagnostics() {
    const agentDiagnostics = (this.agent as any)?.conn?.getDiagnostics?.() || {};
    const sessionInfo = this.sessionManager.getSessionInfo();

    return {
      agent: agentDiagnostics,
      session: sessionInfo,
      workspace: this.workspace,
      conversation_id: this.conversation_id,
    };
  }

  cleanup() {
    console.log('🧹 [CodexAgentManager] Starting cleanup...');

    // 清理所有管理器 - 参考 ACP 的清理模式
    this.eventHandler.cleanup();
    this.sessionManager.cleanup();
    this.fileOperationHandler.cleanup();

    // 停止 agent
    this.agent?.stop?.();

    console.log('✅ [CodexAgentManager] Cleanup completed');
  }
}

export default CodexAgentManager;
