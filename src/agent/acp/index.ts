/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpPermissionRequest, AcpSessionUpdate, AcpBackend, AcpResult, ToolCallUpdate } from '@/common/acpTypes';
import { AcpAdapter } from '@/agent/acp/AcpAdapter';
import { AcpErrorType, createAcpError } from '@/common/acpTypes';
import type { TMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { AcpConnection } from './AcpConnection';

export interface AcpAgentConfig {
  id: string;
  backend: AcpBackend;
  cliPath?: string;
  workingDir: string;
  extra?: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
  };
  onStreamEvent: (data: IResponseMessage) => void;
  onSignalEvent?: (data: IResponseMessage) => void; // 新增：仅发送信号，不更新UI
}

// ACP agent任务类
export class AcpAgent {
  private readonly id: string;
  private extra: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
  };
  private connection: AcpConnection;
  private adapter: AcpAdapter;
  private pendingPermissions = new Map<string, { resolve: (response: any) => void; reject: (error: any) => void }>();
  private statusMessageId: string | null = null;
  private readonly onStreamEvent: (data: IResponseMessage) => void;
  private readonly onSignalEvent?: (data: IResponseMessage) => void;

  constructor(config: AcpAgentConfig) {
    this.id = config.id;
    this.onStreamEvent = config.onStreamEvent;
    this.onSignalEvent = config.onSignalEvent;
    this.extra = config.extra || {
      workspace: config.workingDir,
      backend: config.backend,
      cliPath: config.cliPath,
      customWorkspace: false, // Default to system workspace
    };

    this.connection = new AcpConnection();
    this.adapter = new AcpAdapter(this.id, this.extra.backend);

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.connection.onSessionUpdate = (data: AcpSessionUpdate) => {
      this.handleSessionUpdate(data);
    };
    this.connection.onPermissionRequest = (data: AcpPermissionRequest) => {
      return this.handlePermissionRequest(data);
    };
    this.connection.onEndTurn = () => {
      this.handleEndTurn();
    };
    this.connection.onFileOperation = (operation) => {
      this.handleFileOperation(operation);
    };
  }

  // 启动ACP连接和会话
  async start(): Promise<void> {
    try {
      this.emitStatusMessage('connecting', `Connecting to ${this.extra.backend}...`);

      await Promise.race([
        this.connection.connect(this.extra.backend, this.extra.cliPath, this.extra.workspace),
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error('Connection timeout after 70 seconds'));
          }, 70000)
        ),
      ]);
      this.emitStatusMessage('connected', `Connected to ${this.extra.backend} ACP server`);
      await this.performAuthentication();
      // 避免重复创建会话：仅当尚无活动会话时再创建
      if (!this.connection.hasActiveSession) {
        await this.connection.newSession(this.extra.workspace);
      }
      this.emitStatusMessage('session_active', `Active session created with ${this.extra.backend}`);
    } catch (error) {
      this.emitStatusMessage('error', `Failed to start ${this.extra.backend}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.connection.disconnect();
    this.emitStatusMessage('disconnected', `Disconnected from ${this.extra.backend}`);
  }

  // 发送消息到ACP服务器
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    try {
      if (!this.connection.isConnected || !this.connection.hasActiveSession) {
        return {
          success: false,
          error: createAcpError(AcpErrorType.CONNECTION_NOT_READY, 'ACP connection not ready', true),
        };
      }
      // Save user message to chat history only after successful processing
      // This will be done after the message is successfully sent
      // Update modify time for user activity
      // Smart processing for ACP file references to avoid @filename confusion
      let processedContent = data.content;

      // Only process if there are actual files involved AND the message contains @ symbols
      if (data.files && data.files.length > 0 && processedContent.includes('@')) {
        // Get actual filenames from uploaded files
        const actualFilenames = data.files.map((filePath) => {
          return filePath.split('/').pop() || filePath;
        });

        // Replace @actualFilename with just actualFilename for each uploaded file
        actualFilenames.forEach((filename) => {
          const atFilename = `@${filename}`;
          if (processedContent.includes(atFilename)) {
            processedContent = processedContent.replace(new RegExp(atFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), filename);
          }
        });
      }
      await this.connection.sendPrompt(processedContent);
      this.statusMessageId = null;
      return { success: true, data: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Special handling for Internal error
      if (errorMsg.includes('Internal error')) {
        if (this.extra.backend === 'qwen') {
          const enhancedMsg = `Qwen ACP Internal Error: This usually means authentication failed or ` + `the Qwen CLI has compatibility issues. Please try: 1) Restart the application ` + `2) Use 'npx @qwen-code/qwen-code' instead of global qwen 3) Check if you have valid Qwen credentials.`;
          this.emitErrorMessage(enhancedMsg);
          return {
            success: false,
            error: createAcpError(AcpErrorType.AUTHENTICATION_FAILED, enhancedMsg, false),
          };
        }
      }

      // Classify error types based on message content
      let errorType: AcpErrorType = AcpErrorType.UNKNOWN;
      let retryable = false;

      if (errorMsg.includes('authentication') || errorMsg.includes('认证失败') || errorMsg.includes('[ACP-AUTH-')) {
        errorType = AcpErrorType.AUTHENTICATION_FAILED;
        retryable = false;
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout') || errorMsg.includes('timed out')) {
        errorType = AcpErrorType.TIMEOUT;
        retryable = true;
      } else if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
        errorType = AcpErrorType.PERMISSION_DENIED;
        retryable = false;
      } else if (errorMsg.includes('connection') || errorMsg.includes('Connection')) {
        errorType = AcpErrorType.NETWORK_ERROR;
        retryable = true;
      }

      this.emitErrorMessage(errorMsg);
      return {
        success: false,
        error: createAcpError(errorType, errorMsg, retryable),
      };
    }
  }

  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }): Promise<AcpResult> {
    try {
      if (this.pendingPermissions.has(data.callId)) {
        const { resolve } = this.pendingPermissions.get(data.callId)!;
        this.pendingPermissions.delete(data.callId);
        resolve({ optionId: data.confirmKey });
        return { success: true, data: null };
      }
      return {
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, `Permission request not found for callId: ${data.callId}`, false),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, errorMsg, false),
      };
    }
  }

  private handleSessionUpdate(data: AcpSessionUpdate): void {
    try {
      const messages = this.adapter.convertSessionUpdate(data);

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        // 所有消息都直接发送，不做复杂的替换逻辑
        this.emitMessage(message);
      }
    } catch (error) {
      this.emitErrorMessage(`Failed to process session update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handlePermissionRequest(data: AcpPermissionRequest): Promise<{ optionId: string }> {
    return new Promise((resolve, reject) => {
      const requestId = data.toolCall.toolCallId; // 使用 toolCallId 作为 requestId

      // 检查是否有重复的权限请求
      if (this.pendingPermissions.has(requestId)) {
        // 如果是重复请求，先清理旧的
        const oldRequest = this.pendingPermissions.get(requestId);
        if (oldRequest) {
          oldRequest.reject(new Error('Replaced by new permission request'));
        }
        this.pendingPermissions.delete(requestId);
      }

      this.pendingPermissions.set(requestId, { resolve, reject });

      // 确保权限消息总是被发送，即使有异步问题
      try {
        this.emitPermissionRequest(data); // 直接传递 AcpPermissionRequest
      } catch (error) {
        this.pendingPermissions.delete(requestId);
        reject(error);
        return;
      }

      setTimeout(() => {
        if (this.pendingPermissions.has(requestId)) {
          this.pendingPermissions.delete(requestId);
          reject(new Error('Permission request timed out'));
        }
      }, 70000);
    });
  }

  private handleEndTurn(): void {
    // 使用信号回调发送 end_turn 事件，不添加到消息列表
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'ai_end_turn',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }
  }

  private handleFileOperation(operation: { method: string; path: string; content?: string; sessionId: string }): void {
    // 创建文件操作消息显示在UI中
    const fileOperationMessage: TMessage = {
      id: uuid(),
      conversation_id: this.id,
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: {
        content: this.formatFileOperationMessage(operation),
      },
    };

    this.emitMessage(fileOperationMessage);
  }

  private formatFileOperationMessage(operation: { method: string; path: string; content?: string; sessionId: string }): string {
    switch (operation.method) {
      case 'fs/write_text_file': {
        const content = operation.content || '';
        return `📝 File written: \`${operation.path}\`\n\n\`\`\`\n${content}\n\`\`\``;
      }
      case 'fs/read_text_file':
        return `📖 File read: \`${operation.path}\``;
      default:
        return `🔧 File operation: \`${operation.path}\``;
    }
  }

  private emitStatusMessage(status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error', message: string): void {
    // Use fixed ID for status messages so they update instead of duplicate
    if (!this.statusMessageId) {
      this.statusMessageId = uuid();
    }

    const statusMessage: TMessage = {
      id: this.statusMessageId,
      msg_id: this.statusMessageId,
      conversation_id: this.id,
      type: 'acp_status',
      position: 'center',
      createdAt: Date.now(),
      content: {
        backend: this.extra.backend,
        status,
        message,
      },
    };

    this.emitMessage(statusMessage);
  }

  private emitPermissionRequest(data: AcpPermissionRequest): void {
    // 创建权限消息
    const permissionMessage: TMessage = {
      id: uuid(),
      msg_id: uuid(), // 添加唯一的 msg_id，防止消息合并
      conversation_id: this.id,
      type: 'acp_permission',
      position: 'center',
      createdAt: Date.now(),
      content: data,
    };

    // 重要：将权限请求中的 toolCall 注册到 adapter 的 activeToolCalls 中
    // 这样后续的 tool_call_update 事件就能找到对应的 tool call 了
    if (data.toolCall) {
      // 将权限请求中的 kind 映射到正确的类型
      const mapKindToValidType = (kind?: string): 'read' | 'edit' | 'execute' => {
        switch (kind) {
          case 'read':
            return 'read';
          case 'edit':
            return 'edit';
          case 'execute':
            return 'execute';
          default:
            return 'execute'; // 默认为 execute
        }
      };

      const toolCallUpdate: ToolCallUpdate = {
        sessionId: data.sessionId,
        update: {
          sessionUpdate: 'tool_call' as const,
          toolCallId: data.toolCall.toolCallId,
          status: (data.toolCall.status as any) || 'pending',
          title: data.toolCall.title || 'Tool Call',
          kind: mapKindToValidType(data.toolCall.kind),
          content: data.toolCall.content || [],
          locations: data.toolCall.locations || [],
        },
      };

      // 创建 tool call 消息以注册到 activeToolCalls
      this.adapter.convertSessionUpdate(toolCallUpdate);
    }

    this.emitMessage(permissionMessage);
  }

  private emitErrorMessage(error: string): void {
    const errorMessage: TMessage = {
      id: uuid(),
      conversation_id: this.id,
      type: 'tips',
      position: 'center',
      createdAt: Date.now(),
      content: {
        content: error,
        type: 'error',
      },
    };

    this.emitMessage(errorMessage);
  }

  private extractThoughtSubject(content: string): string {
    const lines = content.split('\n');
    const firstLine = lines[0].trim();

    // Try to extract subject from **Subject** format
    const subjectMatch = firstLine.match(/^\*\*(.+?)\*\*$/);
    if (subjectMatch) {
      return subjectMatch[1];
    }

    // Use first line as subject if it looks like a title
    if (firstLine.length < 80 && !firstLine.endsWith('.')) {
      return firstLine;
    }

    // Extract first sentence as subject
    const firstSentence = content.split('.')[0];
    if (firstSentence.length < 100) {
      return firstSentence;
    }

    return 'Thinking';
  }

  private emitMessage(message: TMessage): void {
    // Create response message based on the message type, following GeminiAgentTask pattern
    const responseMessage: any = {
      conversation_id: this.id,
      id: message.id,
      msg_id: message.msg_id, // 使用消息自己的 msg_id
    };

    // Map TMessage types to backend response types
    switch (message.type) {
      case 'text':
        responseMessage.type = 'content';
        responseMessage.data = message.content.content;
        break;
      case 'acp_status':
        responseMessage.type = 'acp_status';
        responseMessage.data = message.content;
        break;
      case 'acp_permission':
        responseMessage.type = 'acp_permission';
        responseMessage.data = message.content;
        break;
      case 'tips':
        // Distinguish between thought messages and error messages
        if (message.content.type === 'warning' && message.position === 'center') {
          const subject = this.extractThoughtSubject(message.content.content);

          responseMessage.type = 'thought';
          responseMessage.data = {
            subject,
            description: message.content.content,
          };
        } else {
          responseMessage.type = 'error';
          responseMessage.data = message.content.content;
        }
        break;
      case 'acp_tool_call': {
        responseMessage.type = 'acp_tool_call';
        responseMessage.data = message.content;
        break;
      }
      default:
        responseMessage.type = 'content';
        responseMessage.data = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    }
    this.onStreamEvent(responseMessage);
  }

  postMessagePromise(action: string, data: any): Promise<any> {
    switch (action) {
      case 'send.message':
        return this.sendMessage(data);
      case 'stop.stream':
        return this.stop();
      default:
        return Promise.reject(new Error(`Unknown action: ${action}`));
    }
  }

  get isConnected(): boolean {
    return this.connection.isConnected;
  }

  get hasActiveSession(): boolean {
    return this.connection.hasActiveSession;
  }

  // Add kill method for compatibility with WorkerManage
  kill(): void {
    this.stop();
  }

  private async ensureBackendAuth(backend: AcpBackend, loginArg: string): Promise<void> {
    try {
      this.emitStatusMessage('connecting', `Checking ${backend} authentication...`);

      // 使用配置的 CLI 路径调用 login 命令
      const { spawn } = await import('child_process');

      if (!this.extra.cliPath) {
        throw new Error(`No CLI path configured for ${backend} backend`);
      }

      // 使用与 AcpConnection 相同的命令解析逻辑
      let command: string;
      let args: string[];

      if (this.extra.cliPath.startsWith('npx ')) {
        // For "npx @qwen-code/qwen-code" or "npx @anthropic-ai/claude-code"
        const parts = this.extra.cliPath.split(' ');
        const isWindows = process.platform === 'win32';
        command = isWindows ? 'npx.cmd' : 'npx';
        args = [...parts.slice(1), loginArg];
      } else {
        // For regular paths like '/usr/local/bin/qwen' or '/usr/local/bin/claude'
        command = this.extra.cliPath;
        args = [loginArg];
      }

      const loginProcess = spawn(command, args, {
        stdio: 'pipe', // 避免干扰用户界面
        timeout: 70000,
      });

      await new Promise<void>((resolve, reject) => {
        loginProcess.on('close', (code) => {
          if (code === 0) {
            console.log(`${backend} authentication refreshed`);
            resolve();
          } else {
            reject(new Error(`${backend} login failed with code ${code}`));
          }
        });

        loginProcess.on('error', reject);
      });
    } catch (error) {
      console.warn(`${backend} auth refresh failed, will try to connect anyway:`, error);
      // 不抛出错误，让连接尝试继续
    }
  }

  private async ensureQwenAuth(): Promise<void> {
    if (this.extra.backend !== 'qwen') return;
    await this.ensureBackendAuth('qwen', 'login');
  }

  private async ensureClaudeAuth(): Promise<void> {
    if (this.extra.backend !== 'claude') return;
    await this.ensureBackendAuth('claude', '/login');
  }

  private async performAuthentication(): Promise<void> {
    try {
      const initResponse = await this.connection.getInitializeResponse();
      if (!initResponse?.authMethods?.length) {
        // No auth methods available - CLI should handle authentication itself
        this.emitStatusMessage('authenticated', `${this.extra.backend} CLI is ready. Authentication is handled by the CLI itself.`);
        return;
      }

      // 先尝试直接创建session以判断是否已鉴权
      try {
        await this.connection.newSession(this.extra.workspace);
        this.emitStatusMessage('authenticated', `${this.extra.backend} CLI is already authenticated and ready`);
        return;
      } catch (_err) {
        // 需要鉴权，进行条件化“预热”尝试
      }

      // 条件化预热：仅在需要鉴权时尝试调用后端CLI登录以刷新token
      if (this.extra.backend === 'qwen') {
        await this.ensureQwenAuth();
      } else if (this.extra.backend === 'claude') {
        await this.ensureClaudeAuth();
      }

      // 预热后重试创建session
      try {
        await this.connection.newSession(this.extra.workspace);
        this.emitStatusMessage('authenticated', `${this.extra.backend} CLI authentication refreshed and ready`);
        return;
      } catch (error) {
        // If still failing,引导用户手动登录
        this.emitStatusMessage('error', `${this.extra.backend} CLI needs authentication. Please run '${this.extra.backend} login' in terminal first, then reconnect.`);
      }
    } catch (error) {
      this.emitStatusMessage('error', `Authentication check failed. Please ensure ${this.extra.backend} CLI is properly installed and authenticated.`);
    }
  }
}
