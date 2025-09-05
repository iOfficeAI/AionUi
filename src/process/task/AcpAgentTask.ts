/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { TProviderWithModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import { EventEmitter } from 'events';
import { AcpAdapter } from '../../adapter/AcpAdapter';
import { AcpConfigManager } from '../AcpConfig';
import type { AcpBackend, AcpPermissionRequest, AcpSessionUpdate } from '../AcpConnection';
import { AcpConnection } from '../AcpConnection';
import { addMessage, addOrUpdateMessage, updateMessage } from '../message';
import { ProcessChat } from '../initStorage';
import { AcpErrorType, createAcpError, type AcpResult } from '@/common/acpTypes';

export interface AcpAgentConfig {
  id: string;
  name: string;
  backend: AcpBackend;
  cliPath?: string;
  workingDir: string;
  // Optional fields for restoring existing conversations
  createTime?: number;
  modifyTime?: number;
  extra?: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
  };
  model?: TProviderWithModel;
}

// ACP agent任务类
export class AcpAgentTask extends EventEmitter {
  public id: string;
  public name: string;
  public type = 'acp' as const;
  public backend: AcpBackend;
  public workspace: string;
  public status: 'pending' | 'running' | 'finished' = 'pending';

  // TChatConversation required fields
  public createTime: number;
  public modifyTime: number;
  public extra: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
  };
  public model: TProviderWithModel;

  private connection: AcpConnection;

  private adapter: AcpAdapter;

  private cliPath?: string;
  private pendingPermissions = new Map<string, { resolve: (response: any) => void; reject: (error: any) => void }>();

  // Message accumulation for streaming chunks
  private currentAssistantMsgId: string | null = null;

  // Fixed IDs for status messages to prevent duplication
  private statusMessageId: string | null = null;

  // Loading message ID for ACP response waiting
  private loadingMessageId: string | null = null;

  constructor(config: AcpAgentConfig) {
    super();

    this.id = config.id;
    this.name = config.name;
    this.backend = config.backend;
    this.workspace = config.workingDir;
    this.cliPath = config.cliPath;

    // Initialize TChatConversation required fields
    // Use provided times if restoring, otherwise create new
    this.createTime = config.createTime || Date.now();
    this.modifyTime = config.modifyTime || Date.now();
    this.extra = config.extra || {
      workspace: config.workingDir,
      backend: config.backend,
      cliPath: config.cliPath,
      customWorkspace: false, // Default to system workspace
    };
    this.model = config.model || {
      id: `acp-${config.backend}`,
      platform: 'acp',
      name: `${config.backend.toUpperCase()} ACP`,
      baseUrl: '',
      apiKey: '',
      useModel: config.backend,
    };

    this.connection = new AcpConnection();
    this.adapter = new AcpAdapter(this.id, this.backend);

    this.setupConnectionHandlers();
  }

  private async loadSavedConfig(): Promise<void> {
    try {
      // Skip saving CLI path for now to avoid blocking
      if (this.cliPath) {
        // Using provided CLI path
      } else {
        // Load saved CLI path if not provided in config
        try {
          const savedCliPath = (await Promise.race([AcpConfigManager.getCliPath(this.backend), new Promise((_, reject) => setTimeout(() => reject(new Error('GetCliPath timeout')), 1000))])) as string | undefined;
          if (savedCliPath) {
            this.cliPath = savedCliPath;
          }
        } catch (error) {
          // Skipping CLI path check due to storage timeout
        }
      }
    } catch (error) {
      // Don't throw - just continue with what we have
    }
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
      await this.loadSavedConfig();

      this.status = 'running';
      this.emitStatusMessage('connecting', `Connecting to ${this.backend}...`);

      await Promise.race([
        this.connection.connect(this.backend, this.cliPath, this.workspace),
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error('Connection timeout after 30 seconds'));
          }, 30000)
        ),
      ]);
      this.emitStatusMessage('connected', `Connected to ${this.backend} ACP server`);

      // Authenticate based on available methods
      await this.performAuthentication();

      // Create new session
      await this.connection.newSession(this.workspace);
      this.emitStatusMessage('session_active', `Active session created with ${this.backend}`);
    } catch (error) {
      this.status = 'finished';
      this.emitStatusMessage('error', `Failed to start ${this.backend}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.status = 'finished';
    this.connection.disconnect();
    this.emitStatusMessage('disconnected', `Disconnected from ${this.backend}`);
  }

  // 发送消息到ACP服务器
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string; loading_id?: string }): Promise<AcpResult> {
    // Capture the send timestamp for proper message ordering
    const sendTimestamp = Date.now();

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
      this.modifyTime = Date.now();

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

      // Save user message to chat history ONLY after successful sending
      if (data.msg_id && data.content) {
        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.id,
          content: {
            content: data.content,
          },
          createdAt: sendTimestamp,
        };
        addMessage(this.id, userMessage);
        // User message saved to persistent storage
      }

      // Clear message IDs for new conversation turn (but keep loading ID)
      this.currentAssistantMsgId = null;
      this.statusMessageId = null;

      return { success: true, data: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Special handling for Internal error
      if (errorMsg.includes('Internal error')) {
        if (this.backend === 'qwen') {
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
      // Handle the new session update format from Gemini ACP
      if ('update' in data) {
        const update = (data as any).update;

        if (update.sessionUpdate === 'agent_message_chunk' && update.content) {
          this.handleMessageChunk(update.content.text, 'assistant');
        } else if (update.sessionUpdate === 'agent_thought_chunk' && update.content) {
          this.handleMessageChunk(update.content.text, 'thought');
        }

        return;
      }

      // Handle legacy format
      const messages = this.adapter.convertSessionUpdate(data);
      for (const message of messages) {
        this.emitMessage(message);
      }
    } catch (error) {
      this.emitErrorMessage(`Failed to process session update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private handleMessageChunk(text: string, type: 'assistant' | 'thought'): void {
    let msgId: string;

    if (type === 'assistant') {
      // Create new message ID if this is the first chunk of this type
      if (!this.currentAssistantMsgId) {
        this.currentAssistantMsgId = uuid();

        // If there's a loading message, replace it with first chunk
        if (this.loadingMessageId) {
          // Replace the loading message but keep the assistant message ID separate from loading ID
          // This ensures AI reply has its own unique msg_id, not the loading message ID
          this.replaceLoadingMessage(text);
          this.loadingMessageId = null;
          return; // Don't emit a new message, we've replaced the loading one
        }
      }
      msgId = this.currentAssistantMsgId;
    } else {
      // For thought messages, always create a new ID for each distinct thought
      // This prevents different thought chunks from being merged together
      msgId = uuid();
    }

    // Emit message chunk with consistent msg_id for composition
    this.emitMessageChunk(text, type, msgId);
  }

  private emitMessageChunk(text: string, type: 'assistant' | 'thought', msgId: string): void {
    const baseMessage = {
      id: msgId,
      msg_id: msgId, // Important: msg_id for composeMessage logic
      conversation_id: this.id,
      createdAt: Date.now(),
    };

    if (type === 'assistant') {
      const message = {
        ...baseMessage,
        type: 'text' as const,
        position: 'left' as const,
        content: {
          content: text,
        },
      };
      this.emitMessage(message);
    } else if (type === 'thought') {
      const message = {
        ...baseMessage,
        type: 'tips' as const,
        position: 'center' as const,
        content: {
          content: text,
          type: 'warning' as const,
        },
      };
      this.emitMessage(message);
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
        backend: this.backend,
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

    // Emit replacement message to UI - use loading message ID for replacement
    // but the content will get the assistant message ID for future chunks
    const responseMessage = {
      conversation_id: this.id,
      msg_id: this.loadingMessageId, // Use loading ID to find and replace the loading message
      type: 'content',
      data: text,
      isLoadingReplacement: true, // Special flag to indicate this should replace loading content
      assistantMsgId: this.currentAssistantMsgId, // Pass assistant ID for UI to update message properly
    };

    ipcBridge.acpConversation.responseStream.emit(responseMessage);

    // Create the replacement message for persistent storage
    const replacementMessage: TMessage = {
      id: this.currentAssistantMsgId, // Use assistant message ID
      msg_id: this.currentAssistantMsgId, // Set msg_id for proper composition
      type: 'text',
      position: 'left',
      conversation_id: this.id,
      content: {
        content: text,
      },
      createdAt: Date.now(),
    };

    // Update the message in persistent storage - remove loading message and add replacement
    updateMessage(this.id, (messages: TMessage[]) => {
      // Find the loading message to get its timestamp
      const loadingMessage = messages.find((msg) => msg.id === this.loadingMessageId);
      const loadingTimestamp = loadingMessage?.createdAt;

      // Update replacement message with original loading message timestamp
      if (loadingTimestamp) {
        replacementMessage.createdAt = loadingTimestamp;
      }

      // Remove the loading message and add the replacement
      const filteredMessages = messages.filter((msg) => msg.id !== this.loadingMessageId);
      return [...filteredMessages, replacementMessage];
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
    // Update modify time when new messages are emitted
    this.modifyTime = Date.now();

    // Update conversation in chat history
    this.updateChatHistory();

    // Create response message based on the message type, following GeminiAgentTask pattern
    const responseMessage: any = {
      conversation_id: this.id,
      msg_id: message.id,
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

    // Emit to ACP response stream for real-time UI updates
    ipcBridge.acpConversation.responseStream.emit(responseMessage);

    // Persist message to chat history (following GeminiAgentTask pattern)
    addOrUpdateMessage(this.id, transformMessage(responseMessage));
  }

  // Methods to maintain compatibility with existing task interface
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

  private async performAuthentication(): Promise<void> {
    try {
      const initResponse = await this.connection.getInitializeResponse();
      if (!initResponse?.authMethods?.length) {
        // No auth methods available - CLI should handle authentication itself
        this.emitStatusMessage('authenticated', `${this.backend} CLI is ready. Authentication is handled by the CLI itself.`);
        return;
      }

      // Check if CLI is already authenticated by trying to create a session
      try {
        await this.connection.newSession(this.workspace);
        this.emitStatusMessage('authenticated', `${this.backend} CLI is already authenticated and ready`);
        return;
      } catch (error) {
        // CLI requires authentication
      }

      // If CLI requires authentication, guide user to authenticate manually
      this.emitStatusMessage('error', `${this.backend} CLI needs authentication. Please run '${this.backend} login' in terminal first, then reconnect.`);
    } catch (error) {
      this.emitStatusMessage('error', `Authentication check failed. Please ensure ${this.backend} CLI is properly installed and authenticated.`);
    }
  }

  private async updateChatHistory(): Promise<void> {
    try {
      const history = await ProcessChat.get('chat.history');

      if (history) {
        const conversationIndex = history.findIndex((conv: any) => conv.id === this.id);

        if (conversationIndex >= 0) {
          const updatedHistory = history.map((conv: any) => (conv.id === this.id ? { ...conv, modifyTime: this.modifyTime } : conv));
          await ProcessChat.set('chat.history', updatedHistory);
        }
      }
    } catch (error) {
      // Failed to update chat history
    }
  }
}
