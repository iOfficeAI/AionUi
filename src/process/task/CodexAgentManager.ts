/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexAgent } from '@/agent/codex';
import type { NetworkError } from '@/agent/codex/connection/CodexConnection';
import { CodexEventHandler } from '@/agent/codex/handlers/CodexEventHandler';
import { CodexFileOperationHandler } from '@/agent/codex/handlers/CodexFileOperationHandler';
import { CodexSessionManager } from '@/agent/codex/handlers/CodexSessionManager';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { ipcBridge } from '@/common';
import type { IConfirmation, TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { CodexAgentManagerData, FileChange } from '@/common/codex/types';
import { PERMISSION_DECISION_MAP } from '@/common/codex/types/permissionTypes';
import { mapPermissionDecision } from '@/common/codex/utils';
import { AIONUI_FILES_MARKER } from '@/common/constants';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addMessage } from '@process/message';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { ProcessConfig } from '@process/initStorage';
import BaseAgentManager from '@process/task/BaseAgentManager';
import { prepareFirstMessageWithSkillsIndex } from '@process/task/agentUtils';
import { handlePreviewOpenEvent } from '@process/utils/previewUtils';
import i18n from '@process/i18n';
import { getConfiguredAppClientName, getConfiguredAppClientVersion, getConfiguredCodexMcpProtocolVersion, setAppConfig } from '../../common/utils/appConfig';

const APP_CLIENT_NAME = getConfiguredAppClientName();
const APP_CLIENT_VERSION = getConfiguredAppClientVersion();
const CODEX_MCP_PROTOCOL_VERSION = getConfiguredCodexMcpProtocolVersion();

class CodexAgentManager extends BaseAgentManager<CodexAgentManagerData> implements ICodexMessageEmitter {
  workspace?: string;
  agent!: CodexAgent; // Initialized in bootstrap promise
  bootstrap: Promise<CodexAgent>;
  private isFirstMessage: boolean = true;
  private options: CodexAgentManagerData; // 保存原始配置数据 / Store original config data

  constructor(data: CodexAgentManagerData) {
    // Do not fork a worker for Codex; we run the agent in-process now
    super('codex', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data; // 保存原始数据以便后续使用 / Save original data for later use

    this.initAgent(data);
  }

  private initAgent(data: CodexAgentManagerData) {
    // 初始化各个管理器 - 参考 ACP 的架构，传递消息发送器
    const eventHandler = new CodexEventHandler(data.conversation_id, this);
    const sessionManager = new CodexSessionManager(
      {
        conversation_id: data.conversation_id,
        cliPath: data.cliPath,
        workingDir: data.workspace || process.cwd(),
      },
      this
    );
    const fileOperationHandler = new CodexFileOperationHandler(data.workspace || process.cwd(), data.conversation_id, this);

    // 使用 SessionManager 来管理连接状态 - 参考 ACP 的模式
    // Use async bootstrap to read config and initialize agent
    this.bootstrap = (async () => {
      // 设置 Codex Agent 的应用配置，使用 Electron API 在主进程中
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

      // Read codex.config for global yoloMode setting
      // yoloMode priority: data.yoloMode (from CronService) > config setting
      // yoloMode 优先级：data.yoloMode（来自 CronService）> 配置设置
      const codexConfig = await ProcessConfig.get('codex.config');
      const yoloMode = data.yoloMode ?? codexConfig?.yoloMode;

      this.agent = new CodexAgent({
        id: data.conversation_id,
        cliPath: data.cliPath,
        workingDir: data.workspace || process.cwd(),
        eventHandler,
        sessionManager,
        fileOperationHandler,
        sandboxMode: data.sandboxMode || 'workspace-write', // Enable file writing within workspace by default
        yoloMode: yoloMode, // yoloMode from CronService or config
        onNetworkError: (error) => {
          this.handleNetworkError(error);
        },
      });

      await this.startWithSessionManagement();
      return this.agent;
    })().catch((e) => {
      this.agent?.getSessionManager?.()?.emitSessionEvent('bootstrap_failed', { error: e.message });
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
    this.performPostConnectionSetup();
  }

  /**
   * 连接后设置 - 参考 ACP 的认证和会话创建
   */
  private performPostConnectionSetup(): void {
    try {
      // Get connection diagnostics
      void this.getDiagnostics();

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
    cronBusyGuard.setProcessing(this.conversation_id, true);
    try {
      await this.bootstrap;
      const contentToSend = data.content?.includes(AIONUI_FILES_MARKER) ? data.content.split(AIONUI_FILES_MARKER)[0].trimEnd() : data.content;

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
      let processedContent = this.agent.getFileOperationHandler().processFileReferences(contentToSend, data.files);

      // 如果是第一条消息，通过 newSession 发送以避免双消息问题
      if (this.isFirstMessage) {
        this.isFirstMessage = false;

        // 注入智能助手的预设规则和 skills 索引（如果有）
        // Inject preset context and skills INDEX from smart assistant (if available)
        processedContent = await prepareFirstMessageWithSkillsIndex(processedContent, {
          presetContext: this.options.presetContext,
          enabledSkills: this.options.enabledSkills,
        });

        const result = await this.agent.newSession(this.workspace, processedContent);

        // Session created successfully - Codex will send session_configured event automatically
        // Note: setProcessing(false) is called in CodexMessageProcessor.processTaskComplete
        // when the message flow is actually complete
        return result;
      } else {
        // 后续消息使用正常的 sendPrompt
        const result = await this.agent.sendPrompt(processedContent);
        // Note: setProcessing(false) is called in CodexMessageProcessor.processTaskComplete
        return result;
      }
    } catch (e) {
      cronBusyGuard.setProcessing(this.conversation_id, false);
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
      // Emit to frontend - frontend will handle transformation and persistence
      ipcBridge.codexConversation.responseStream.emit(message);
      throw e;
    }
  }

  /**
   * 统一的确认方法 - 通过 addConfirmation 管理所有确认项
   * 参考 GeminiAgentManager 和 AcpAgentManager 的实现
   */
  async confirm(id: string, callId: string, data: string) {
    super.confirm(id, callId, data);
    await this.bootstrap;
    this.agent.getEventHandler().getToolHandlers().removePendingConfirmation(callId);

    // Use standardized permission decision mapping
    // Maps UI options to Codex CLI's ReviewDecision (snake_case format)
    const decisionKey = data in PERMISSION_DECISION_MAP ? (data as keyof typeof PERMISSION_DECISION_MAP) : 'reject_once';
    const decision = mapPermissionDecision(decisionKey) as 'approved' | 'approved_for_session' | 'denied' | 'abort';

    const isApproved = decision === 'approved' || decision === 'approved_for_session';

    // Store decision in ApprovalStore if user selected "always allow" or "always reject"
    if (decision === 'approved_for_session' || decision === 'abort') {
      this.storeApprovalDecision(callId, decision);
    }

    // Apply patch changes if available and approved
    const changes = this.agent.getEventHandler().getToolHandlers().getPatchChanges(callId);
    if (changes && isApproved) {
      await this.applyPatchChanges(callId, changes);
    }

    // Normalize call id back to server's codex_call_id
    // Handle the new unified permission_ prefix as well as legacy prefixes
    const origCallId = callId.startsWith('permission_')
      ? callId.substring(11) // Remove 'permission_' prefix
      : callId.startsWith('patch_')
        ? callId.substring(6)
        : callId.startsWith('elicitation_')
          ? callId.substring(12)
          : callId.startsWith('exec_')
            ? callId.substring(5)
            : callId;

    // Respond to elicitation (server expects JSON-RPC response)
    this.agent.respondElicitation(origCallId, decision);

    // Also resolve local pause gate to resume queued requests
    this.agent.resolvePermission(origCallId, isApproved);
  }

  /**
   * Store approval/rejection decision in ApprovalStore based on request type
   */
  private storeApprovalDecision(callId: string, decision: 'approved_for_session' | 'abort'): void {
    const toolHandlers = this.agent.getEventHandler().getToolHandlers();

    // Check if this is an exec request
    const execMeta = toolHandlers.getExecRequestMeta(callId);
    if (execMeta) {
      this.agent.storeExecApproval(execMeta.command, execMeta.cwd, decision);
      return;
    }

    // Check if this is a patch request
    const patchChanges = toolHandlers.getPatchChanges(callId);
    if (patchChanges) {
      const files = Object.keys(patchChanges);
      this.agent.storePatchApproval(files, decision);
    }
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
    this.emitStatus('error');

    // Create a user-friendly error message based on error type
    let userMessage = '';
    let recoveryActions: string[] = [];

    switch (error.type) {
      case 'cloudflare_blocked':
        userMessage = i18n.t('codex.network.cloudflare_blocked_title', { service: 'Codex' });
        recoveryActions = i18n.t('codex.network.recovery_actions.cloudflare_blocked', { returnObjects: true }) as string[];
        break;

      case 'network_timeout':
        userMessage = i18n.t('codex.network.network_timeout_title');
        recoveryActions = i18n.t('codex.network.recovery_actions.network_timeout', { returnObjects: true }) as string[];
        break;

      case 'connection_refused':
        userMessage = i18n.t('codex.network.connection_refused_title');
        recoveryActions = i18n.t('codex.network.recovery_actions.connection_refused', { returnObjects: true }) as string[];
        break;

      default:
        userMessage = i18n.t('codex.network.unknown_error_title');
        recoveryActions = i18n.t('codex.network.recovery_actions.unknown', { returnObjects: true }) as string[];
    }

    const detailedMessage = `${userMessage}\n\n${i18n.t('codex.network.recovery_suggestions')}\n${recoveryActions.join('\n')}\n\n${i18n.t('codex.network.technical_info')}\n- ${i18n.t('codex.network.error_type')}：${error.type}\n- ${i18n.t('codex.network.retry_count')}：${error.retryCount}\n- ${i18n.t('codex.network.error_details')}：${error.originalError.substring(0, 200)}${error.originalError.length > 200 ? '...' : ''}`;

    // Emit network error message to UI
    const networkErrorMessage: IResponseMessage = {
      type: 'tips',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        error: error,
        title: userMessage,
        message: detailedMessage,
        recoveryActions: recoveryActions,
        quickSwitchContent: i18n.t('codex.network.quick_switch_content'),
      },
    };

    // Emit network error message to UI
    // Backend handles persistence before emitting to frontend
    const tMessage = transformMessage(networkErrorMessage);
    if (tMessage) {
      addMessage(this.conversation_id, tMessage);
    }
    ipcBridge.codexConversation.responseStream.emit(networkErrorMessage);
  }

  private emitStatus(status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error' | 'disconnected') {
    const statusMessage: IResponseMessage = {
      type: 'agent_status',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        backend: 'codex', // Agent identifier from AcpBackend type
        status,
      },
    };
    // Use emitAndPersistMessage to ensure status messages are both emitted and persisted
    this.emitAndPersistMessage(statusMessage);
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
    this.agent?.stop?.().catch((error) => {
      console.error('Failed to stop Codex agent during cleanup:', error);
    });

    // Cleanup completed
  }

  // Stop current Codex stream in-process (override ForkTask default which targets a worker)
  stop() {
    return this.agent?.stop?.() ?? Promise.resolve();
  }

  // Ensure we clean up agent resources on kill
  kill() {
    try {
      this.agent?.stop?.().catch((error) => {
        console.error('Failed to stop Codex agent during kill:', error);
      });
    } finally {
      super.kill();
    }
  }

  emitAndPersistMessage(message: IResponseMessage, persist: boolean = true): void {
    message.conversation_id = this.conversation_id;

    // Handle preview_open event (chrome-devtools navigation interception)
    // 处理 preview_open 事件（chrome-devtools 导航拦截）
    if (handlePreviewOpenEvent(message)) {
      return; // Don't process further / 不需要继续处理
    }

    // Backend handles persistence if needed
    if (persist) {
      const tMessage = transformMessage(message);
      if (tMessage) {
        addMessage(this.conversation_id, tMessage);
        // Note: Cron command detection is handled in CodexMessageProcessor.processFinalMessage
        // where we have the complete agent_message text
      }
    }

    // Always emit to frontend for UI display
    ipcBridge.codexConversation.responseStream.emit(message);
  }

  /**
   * 实现 ICodexMessageEmitter 接口的 addConfirmation 方法
   * 委托给 BaseAgentManager 的 addConfirmation 进行统一管理
   */
  addConfirmation(data: IConfirmation): void {
    super.addConfirmation(data);
  }

  persistMessage(message: TMessage): void {
    // Direct persistence to database without emitting to frontend
    // Used for final messages where frontend has already displayed content via deltas
    addMessage(this.conversation_id, message);
  }

  /**
   * Send message back to AI agent (for system response feedback)
   * Used by CodexMessageProcessor to send cron command results back to AI
   */
  async sendMessageToAgent(content: string): Promise<void> {
    await this.sendMessage({
      content,
      msg_id: uuid(),
    });
  }

  // ===== ApprovalStore integration (ICodexMessageEmitter) =====

  /**
   * Check if an exec command has been approved for session
   */
  checkExecApproval(command: string | string[], cwd?: string): boolean {
    return this.agent?.checkExecApproval(command, cwd) || false;
  }

  /**
   * Check if file changes have been approved for session
   */
  checkPatchApproval(files: string[]): boolean {
    return this.agent?.checkPatchApproval(files) || false;
  }

  /**
   * Check if an exec command has been rejected for session (abort)
   */
  checkExecRejection(command: string | string[], cwd?: string): boolean {
    return this.agent?.checkExecRejection(command, cwd) || false;
  }

  /**
   * Check if file changes have been rejected for session (abort)
   */
  checkPatchRejection(files: string[]): boolean {
    return this.agent?.checkPatchRejection(files) || false;
  }

  /**
   * Auto-confirm a permission request (used when ApprovalStore has cached approval)
   */
  autoConfirm(callId: string, decision: string): void {
    // Simulate user clicking "allow_always" - reuse the confirm logic
    void this.confirm(callId, callId, decision);
  }
}

export default CodexAgentManager;
