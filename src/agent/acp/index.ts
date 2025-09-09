/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpPermissionRequest, AcpSessionUpdate } from '@/agent/acp/AcpAdapter';
import { AcpAdapter } from '@/agent/acp/AcpAdapter';
import { AcpErrorType, createAcpError } from '@/common/acpTypes';
import type { AcpBackend, AcpResult } from '@/common/acpTypes';
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
  onReplaceLoadingMessage: (data: { id: string; msg_id: string; text: string; loadingMessageId?: string }) => void;
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
  // Message accumulation for streaming chunks
  private currentAssistantMsgId: string | null = null;
  // Fixed IDs for status messages to prevent duplication
  private statusMessageId: string | null = null;
  // Loading message ID for ACP response waiting
  public loadingMessageId: string | null = null;
  private readonly onStreamEvent: (data: IResponseMessage) => void;
  private readonly onReplaceLoadingMessage: (data: { id: string; msg_id: string; text: string; loadingMessageId: string }) => void;

  constructor(config: AcpAgentConfig) {
    this.id = config.id;
    this.onStreamEvent = config.onStreamEvent;
    this.onReplaceLoadingMessage = config.onReplaceLoadingMessage;
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
  }

  // 启动ACP连接和会话
  async start(): Promise<void> {
    try {
      this.emitStatusMessage('connecting', `Connecting to ${this.extra.backend}...`);
      await Promise.race([
        this.connection.connect(this.extra.backend, this.extra.cliPath, this.extra.workspace),
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error('Connection timeout after 30 seconds'));
          }, 30000)
        ),
      ]);
      this.emitStatusMessage('connected', `Connected to ${this.extra.backend} ACP server`);
      await this.performAuthentication();
      await this.connection.newSession(this.extra.workspace);
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
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string; loading_id?: string }): Promise<AcpResult> {
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

      // Set loading message ID from frontend if provided
      if (data.loading_id) {
        this.loadingMessageId = data.loading_id;
      }

      // Send processed content to ACP service to avoid @ symbol confusion
      await this.connection.sendPrompt(processedContent);

      // Clear message IDs for new conversation turn (but keep loading ID)
      this.currentAssistantMsgId = null;
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
      // Handle permission confirmation
      // callId is the requestId used to store the pending permission
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

        if (message.type === 'text') {
          // 如果是第一个文本分片且还没有 currentAssistantMsgId
          if (!this.currentAssistantMsgId && this.loadingMessageId) {
            // 创建 assistant message ID
            this.currentAssistantMsgId = uuid();
            // 替换 loading 消息为第一个分片内容
            this.replaceLoadingMessage(message.content.content);
          } else {
            this.emitMessage(message);
          }
        } else {
          // 非文本消息直接发送
          this.emitMessage(message);
        }
      }
    } catch (error) {
      this.emitErrorMessage(`Failed to process session update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handlePermissionRequest(data: AcpPermissionRequest): Promise<{ optionId: string }> {
    return new Promise((resolve, reject) => {
      const requestId = uuid();

      // Store the pending permission request
      this.pendingPermissions.set(requestId, { resolve, reject });

      // Emit permission request message to UI
      this.emitPermissionRequest({
        ...data,
        requestId,
      });

      // Auto-timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingPermissions.has(requestId)) {
          this.pendingPermissions.delete(requestId);
          reject(new Error('Permission request timed out'));
        }
      }, 30000);
    });
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

  private emitPermissionRequest(data: any): void {
    const permissionMessage: TMessage = {
      id: uuid(),
      conversation_id: this.id,
      type: 'acp_permission',
      position: 'center',
      createdAt: Date.now(),
      content: data,
    };

    this.emitMessage(permissionMessage);
  }

  private replaceLoadingMessage(text: string): void {
    if (!this.loadingMessageId || !this.currentAssistantMsgId) {
      return;
    }
    this.onReplaceLoadingMessage({
      id: this.currentAssistantMsgId,
      msg_id: this.loadingMessageId,
      text,
      loadingMessageId: this.loadingMessageId, // 传递 loading message ID
    });
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
      msg_id: this.loadingMessageId,
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
      default:
        responseMessage.type = 'content';
        responseMessage.data = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    }
    this.onStreamEvent(responseMessage);
  }

  postMessagePromise(action: string, data: any): Promise<any> {
    switch (action) {
      case 'send.message':
        console.log('postMessagePromise', data);
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

  private async performAuthentication(): Promise<void> {
    try {
      const initResponse = await this.connection.getInitializeResponse();
      if (!initResponse?.authMethods?.length) {
        // No auth methods available - CLI should handle authentication itself
        this.emitStatusMessage('authenticated', `${this.extra.backend} CLI is ready. Authentication is handled by the CLI itself.`);
        return;
      }

      // Check if CLI is already authenticated by trying to create a session
      try {
        await this.connection.newSession(this.extra.workspace);
        this.emitStatusMessage('authenticated', `${this.extra.backend} CLI is already authenticated and ready`);
        return;
      } catch (error) {
        // CLI requires authentication
      }

      // If CLI requires authentication, guide user to authenticate manually
      this.emitStatusMessage('error', `${this.extra.backend} CLI needs authentication. Please run '${this.extra.backend} login' in terminal first, then reconnect.`);
    } catch (error) {
      this.emitStatusMessage('error', `Authentication check failed. Please ensure ${this.extra.backend} CLI is properly installed and authenticated.`);
    }
  }
}
