/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexMcpAgent } from '@/agent/codex';
import type { NetworkError } from '@/agent/codex/connection/CodexMcpConnection';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addMessage, addOrUpdateMessage } from '@/process/message';
import BaseAgentManager from '@/process/task/BaseAgentManager';
import { t } from 'i18next';
import { CodexEventHandler } from '@/agent/codex/handlers/CodexEventHandler';
import { CodexSessionManager } from '@/agent/codex/handlers/CodexSessionManager';
import { CodexFileOperationHandler } from '@/agent/codex/handlers/CodexFileOperationHandler';
import { CodexMessageTransformer } from '@/agent/codex/messaging/CodexMessageTransformer';
import type { CodexAgentManagerData, FileChange } from '@/common/codex/types';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { setAppConfig, getConfiguredAppClientName, getConfiguredAppClientVersion, getConfiguredCodexMcpProtocolVersion } from './appConfig';
import { mapPermissionDecision } from '@/common/codex/utils';

const APP_CLIENT_NAME = getConfiguredAppClientName();
const APP_CLIENT_VERSION = getConfiguredAppClientVersion();
const CODEX_MCP_PROTOCOL_VERSION = getConfiguredCodexMcpProtocolVersion();

class CodexAgentManager extends BaseAgentManager<CodexAgentManagerData> implements ICodexMessageEmitter {
  workspace?: string;
  agent: CodexMcpAgent;
  bootstrap: Promise<CodexMcpAgent>;
  private isFirstMessage: boolean = true;

  constructor(data: CodexAgentManagerData) {
    // Do not fork a worker for Codex; we run the agent in-process now
    super('codex', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;

    this.initAgent(data);
  }

  private initAgent(data: CodexAgentManagerData) {
    // 初始化各个管理器 - 参考 ACP 的架构，传递消息发送器
    const eventHandler = new CodexEventHandler(data.conversation_id, this);
    const sessionManager = new CodexSessionManager({
      conversation_id: data.conversation_id,
      cliPath: data.cliPath,
      workingDir: data.workspace || process.cwd(),
    });
    const fileOperationHandler = new CodexFileOperationHandler(data.conversation_id, data.workspace);

    // 设置 Codex Agent 的应用配置，使用 Electron API 在主进程中
    (async () => {
      try {
        const electronModule = await import('electron');
        const app = electronModule.app;
        setAppConfig({
          name: app.getName(),
          version: app.getVersion(),
          protocolVersion: CODEX_MCP_PROTOCOL_VERSION,
        });
      } catch (error) {
        // 如果不在主进程中，使用通用方法获取版本
        setAppConfig({
          name: APP_CLIENT_NAME,
          version: APP_CLIENT_VERSION,
          protocolVersion: CODEX_MCP_PROTOCOL_VERSION,
        });
      }
    })();

    this.agent = new CodexMcpAgent({
      id: data.conversation_id,
      cliPath: data.cliPath,
      workingDir: data.workspace || process.cwd(),
      eventHandler,
      sessionManager,
      fileOperationHandler,
      onNetworkError: (error) => {
        this.handleNetworkError(error);
      },
    });

    // 使用 SessionManager 来管理连接状态 - 参考 ACP 的模式
    this.bootstrap = this.startWithSessionManagement()
      .then(async () => {
        return this.agent;
      })
      .catch((e) => {
        this.agent.getSessionManager().emitSessionEvent('bootstrap_failed', { error: e.message });
        throw e;
      });
  }

  /**
   * 使用会话管理器启动 - 参考 ACP 的启动流程
   */
  private async startWithSessionManagement(): Promise<void> {
    // 1. 启动会话管理器
    await this.agent.getSessionManager().startSession();

    // 2. 启动 MCP Agent
    await this.agent.start();

    // 3. 执行认证和会话创建
    await this.performPostConnectionSetup();

    // 4. 恢复权限状态
    await this.restorePermissionState();

    // Session management startup completed
  }

  /**
   * 连接后设置 - 参考 ACP 的认证和会话创建
   */
  private async performPostConnectionSetup(): Promise<void> {
    try {
      // Get connection diagnostics
      const _diagnostics = this.getDiagnostics();

      // 延迟会话创建到第一条用户消息时，避免空 prompt 问题
      // Session will be created with first user message - no session event sent here
    } catch (error) {
      // 输出更详细的诊断信息
      const diagnostics = this.getDiagnostics();

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

      // Log troubleshooting suggestions for debugging

      // 即使设置失败，也尝试继续运行，因为连接可能仍然有效
      this.agent.getSessionManager().emitSessionEvent('session_partial', {
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
    try {
      await this.bootstrap;

      // Save user message to chat history only (renderer already inserts right-hand bubble)
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

      // 处理文件引用 - 参考 ACP 的文件引用处理
      const processedContent = this.agent.getFileOperationHandler().processFileReferences(data.content, data.files);

      // 如果是第一条消息，通过 newSession 发送以避免双消息问题
      if (this.isFirstMessage) {
        this.isFirstMessage = false;
        const result = await this.agent.newSession(this.workspace, processedContent);

        // Session created successfully - Codex will send session_configured event automatically

        return result;
      } else {
        // 后续消息使用正常的 sendPrompt
        const result = await this.agent.sendPrompt(processedContent);
        return result;
      }
    } catch (e) {
      // 对于某些错误类型，避免重复错误消息处理
      // 这些错误通常已经通过 MCP 连接的事件流处理过了
      const errorMsg = e instanceof Error ? e.message : String(e);
      const isUsageLimitError = errorMsg.toLowerCase().includes("you've hit your usage limit");

      if (isUsageLimitError) {
        // Usage limit 错误已经通过 MCP 事件流处理，避免重复发送
        throw e;
      }

      // Create more descriptive error message based on error type
      let errorMessage = 'Failed to send message to Codex';
      if (e instanceof Error) {
        if (e.message.includes('timeout')) {
          errorMessage = 'Request timed out. Please check your connection and try again.';
        } else if (e.message.includes('authentication')) {
          errorMessage = 'Authentication failed. Please verify your Codex credentials.';
        } else if (e.message.includes('network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else {
          errorMessage = `Codex error: ${e.message}`;
        }
      }

      const message: IResponseMessage = {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: data.msg_id || uuid(),
        data: errorMessage,
      };
      addMessage(this.conversation_id, transformMessage(message));
      ipcBridge.codexConversation.responseStream.emit(message);
      throw e;
    }
  }

  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }) {
    await this.bootstrap;
    this.agent.getEventHandler().getToolHandlers().removePendingConfirmation(data.callId);

    // Use standardized permission decision mapping
    const decision = mapPermissionDecision(data.confirmKey as any) as 'approved' | 'approved_for_session' | 'denied' | 'abort';
    const isApproved = decision === 'approved' || decision === 'approved_for_session';

    // Apply patch changes if available and approved
    const changes = this.agent.getEventHandler().getToolHandlers().getPatchChanges(data.callId);
    if (changes && isApproved) {
      await this.applyPatchChanges(data.callId, changes);
    }

    // Normalize call id back to server's codex_call_id
    // Handle the new unified permission_ prefix as well as legacy prefixes
    const origCallId = data.callId.startsWith('permission_')
      ? data.callId.substring(11) // Remove 'permission_' prefix
      : data.callId.startsWith('patch_')
        ? data.callId.substring(6)
        : data.callId.startsWith('elicitation_')
          ? data.callId.substring(12)
          : data.callId.startsWith('exec_')
            ? data.callId.substring(5)
            : data.callId;

    // Log the permission decision for debugging
    console.log('🔐 Permission Decision:', {
      confirmKey: data.confirmKey,
      mappedDecision: decision,
      callId: origCallId,
      isApproved,
    });

    // Respond to elicitation (server expects JSON-RPC response)
    this.agent.respondElicitation(origCallId, decision);

    // Also resolve local pause gate to resume queued requests
    this.agent.resolvePermission(origCallId, isApproved);
    return;
  }

  private async applyPatchChanges(callId: string, changes: Record<string, FileChange>): Promise<void> {
    try {
      // 使用文件操作处理器来应用更改 - 参考 ACP 的批量操作
      await this.agent.getFileOperationHandler().applyBatchChanges(changes);

      // 发送成功事件
      this.agent.getSessionManager().emitSessionEvent('patch_applied', {
        callId,
        changeCount: Object.keys(changes).length,
        files: Object.keys(changes),
      });

      // Patch changes applied successfully
    } catch (error) {
      // 发送失败事件
      this.agent.getSessionManager().emitSessionEvent('patch_failed', {
        callId,
        error: error instanceof Error ? error.message : String(error),
      });

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

    // Generated user message and recovery actions for UI

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

    // Emit network error message to UI
    // Add to message history and emit to UI
    addOrUpdateMessage(this.conversation_id, transformMessage(networkErrorMessage));
    ipcBridge.codexConversation.responseStream.emit(networkErrorMessage);
  }

  private async restorePermissionState(): Promise<void> {
    // This method would restore any pending permission states from storage
    // Implementation would depend on how permissions are persisted
  }

  private emitStatus(status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error' | 'disconnected', message: string) {
    const statusMessage: IResponseMessage = {
      type: 'codex_status',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        status,
        message,
      },
    };
    ipcBridge.codexConversation.responseStream.emit(statusMessage);
  }

  getDiagnostics() {
    const agentDiagnostics = this.agent.getDiagnostics();
    const sessionInfo = this.agent.getSessionManager().getSessionInfo();

    return {
      agent: agentDiagnostics,
      session: sessionInfo,
      workspace: this.workspace,
      conversation_id: this.conversation_id,
    };
  }

  cleanup() {
    // 清理所有管理器 - 参考 ACP 的清理模式
    this.agent.getEventHandler().cleanup();
    this.agent.getSessionManager().cleanup();
    this.agent.getFileOperationHandler().cleanup();

    // 停止 agent
    this.agent?.stop?.();

    // Cleanup completed
  }

  // Stop current Codex stream in-process (override ForkTask default which targets a worker)
  stop() {
    return this.agent?.stop?.() ?? Promise.resolve();
  }

  // Ensure we clean up agent resources on kill
  kill() {
    try {
      this.agent?.stop?.();
    } finally {
      super.kill();
    }
  }

  // 实现 ICodexMessageEmitter 接口
  emitMessage(message: IResponseMessage): void {
    // Handle auto permission decisions before emitting
    if (message.type === 'codex_auto_permission_decision') {
      this.handleAutoPermissionDecision(message);
      return; // Don't emit this internal message to UI
    }

    ipcBridge.codexConversation.responseStream.emit(message);
  }

  /**
   * Handle auto permission decisions from EventHandler
   * This processes the decision, applies any patch changes, and responds to the server
   * 处理自动权限决策，应用补丁更改，并响应服务器
   */
  private async handleAutoPermissionDecision(message: IResponseMessage): Promise<void> {
    const data = message.data as { callId: string; decision: 'approved' | 'denied'; isApproved: boolean; storedChoice: string };

    console.log('🤖 Handling auto permission decision:', data);

    if (!data.callId || !data.decision) {
      return;
    }

    try {
      await this.bootstrap;

      // Remove pending confirmation
      this.agent.getEventHandler().getToolHandlers().removePendingConfirmation(`permission_${data.callId}`);

      // Apply patch changes if available and approved
      const changes = this.agent.getEventHandler().getToolHandlers().getPatchChanges(`permission_${data.callId}`);
      if (changes && data.isApproved) {
        await this.applyPatchChanges(`permission_${data.callId}`, changes);
      }

      // Send simple approved/denied decision to Codex CLI (not approved_for_session)
      this.agent.respondElicitation(data.callId, data.decision as 'approved' | 'approved_for_session' | 'denied' | 'abort');
      this.agent.resolvePermission(data.callId, data.isApproved);
    } catch (error) {
      console.error('Auto permission handling failed:', error);
    }
  }

  emitAndPersistMessage(message: IResponseMessage, persist: boolean = true): void {
    if (persist) {
      // Skip persistence for status messages - they should only be displayed in UI
      if (message.type === 'codex_status' || message.type === 'codex_session_event') {
        // Only emit to UI, don't persist to message history
        ipcBridge.codexConversation.responseStream.emit(message);
        return;
      }

      // Use Codex-specific transformer for Codex messages
      let transformedMessage: TMessage | undefined;

      if (CodexMessageTransformer.isCodexSpecificMessage(message.type)) {
        transformedMessage = CodexMessageTransformer.transformCodexMessage(message);
      } else {
        transformedMessage = transformMessage(message);
      }

      if (transformedMessage) {
        addOrUpdateMessage(this.conversation_id, transformedMessage);
      }
    }
    ipcBridge.codexConversation.responseStream.emit(message);
  }
}

export default CodexAgentManager;
