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
import { addMessage, addOrUpdateMessage } from '../message';
import { ProcessChat } from '../initStorage';

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
      selectedModel: config.backend,
    };

    this.connection = new AcpConnection();
    this.adapter = new AcpAdapter(this.id, this.backend);

    this.setupConnectionHandlers();
  }

  private async loadSavedConfig(): Promise<void> {
    try {
      // Skip saving CLI path for now to avoid blocking
      if (this.cliPath) {
        console.log('Using provided CLI path:', this.cliPath);
      } else {
        // Load saved CLI path if not provided in config
        try {
          const savedCliPath = (await Promise.race([AcpConfigManager.getCliPath(this.backend), new Promise((_, reject) => setTimeout(() => reject(new Error('GetCliPath timeout')), 5000))])) as string | undefined;
          if (savedCliPath) {
            this.cliPath = savedCliPath;
          } else {
            console.log('No saved CLI path found');
          }
        } catch (error) {
          console.error('Failed to get CLI path:', error);
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
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{ success: boolean; msg?: string }> {
    try {

      if (!this.connection.isConnected || !this.connection.hasActiveSession) {
        throw new Error('ACP connection not ready');
      }

      // Update modify time for user activity
      this.modifyTime = Date.now();

      // Smart processing for ACP file references to avoid @filename confusion
      let processedContent = data.content;
      
      // Only process if there are actual files involved AND the message contains @ symbols
      if ((data.files && data.files.length > 0) && processedContent.includes('@')) {
        // Get actual filenames from uploaded files
        const path = require('path');
        const actualFilenames = data.files.map(filePath => {
          return path.basename(filePath);
        });
        
        // Replace @actualFilename with just actualFilename for each uploaded file
        actualFilenames.forEach(filename => {
          const atFilename = `@${filename}`;
          if (processedContent.includes(atFilename)) {
            processedContent = processedContent.replace(
              new RegExp(atFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 
              filename
            );
          }
        });
      }

      // Persist user message to chat history and emit to UI (following GeminiAgentTask pattern)
      if (data.msg_id) {
        const userMessage: TMessage = {
          id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.id,
          content: {
            content: data.content, // Store original content in UI
          },
          createdAt: Date.now(),
        };
        // Persist to chat history
        addMessage(this.id, userMessage);
        
        // Also emit to UI for immediate display
        const userResponseMessage = {
          conversation_id: this.id,
          msg_id: data.msg_id,
          type: 'user_content',
          data: data.content, // Show original content in UI
        };
        ipcBridge.acpConversation.responseStream.emit(userResponseMessage);
      }

      // Send processed content to ACP service to avoid @ symbol confusion
      await this.connection.sendPrompt(processedContent);

      // Clear message IDs for new conversation turn
      this.currentAssistantMsgId = null;
      this.statusMessageId = null;

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(errorMsg);
      return { success: false, msg: errorMsg };
    }
  }

  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }): Promise<{ success: boolean; msg?: string }> {
    try {
      // Handle permission confirmation
      // callId is the requestId used to store the pending permission
      if (this.pendingPermissions.has(data.callId)) {
        const { resolve } = this.pendingPermissions.get(data.callId)!;
        this.pendingPermissions.delete(data.callId);
        resolve({ optionId: data.confirmKey });
        return { success: true };
      }

      return { success: false, msg: `Permission request not found for callId: ${data.callId}` };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, msg: errorMsg };
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
        responseMessage.type = 'error'; // Tips with error type map to error response
        responseMessage.data = message.content.content;
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
        return;
      }

      // Debug environment variables for Gemini
      if (this.backend === 'gemini') {
        // Check if API key is available, set it if not
        if (!process.env.GEMINI_API_KEY) {
          // 请在这里使用你的有效 API key
          process.env.GEMINI_API_KEY = 'AIzaSyD8MT6K7s7yDyrrJ9FuHqk0dF2tpiL5SOo';
        } else {
          console.log('GEMINI_API_KEY already set in environment');
        }
      }

      // Skip saved auth check for now to avoid blocking
      let savedAuth = null;
      try {
        savedAuth = await Promise.race([AcpConfigManager.getValidAuthInfo(this.backend), new Promise((_, reject) => setTimeout(() => reject(new Error('GetValidAuthInfo timeout')), 3000))]);
      } catch (error) {
        console.error('Failed to get saved auth info:', error);
      }

      if (savedAuth) {
        try {
          await this.connection.authenticate((savedAuth as any).authMethodId);
          this.emitStatusMessage('authenticated', `Authenticated with ${this.backend} using saved credentials`);
          return;
        } catch (error) {
          // Don't clear auth info if it causes blocking
          console.error('Failed to authenticate with saved credentials:', error);
        }
      } else {
        console.log('No saved auth info found');
      }

      // If no saved auth or saved auth failed, try available methods
      // For Gemini, prefer API key authentication
      let sortedMethods = [...initResponse.authMethods];
      if (this.backend === 'gemini') {
        // Sort methods to prioritize API key
        sortedMethods.sort((a, b) => {
          if (a.id === 'gemini-api-key') return -1;
          if (b.id === 'gemini-api-key') return 1;
          if (a.id === 'oauth-personal') return -1;
          if (b.id === 'oauth-personal') return 1;
          return 0;
        });
      }

      for (const authMethod of sortedMethods) {
        try {
          // We'll try OAuth even without GOOGLE_CLOUD_PROJECT to see what happens
          if (authMethod.id === 'oauth-personal' && this.backend === 'gemini' && !process.env.GOOGLE_CLOUD_PROJECT) {
            console.log('Skipping OAuth without GOOGLE_CLOUD_PROJECT');
          }

          await Promise.race([
            this.connection.authenticate(authMethod.id),
            new Promise((_, reject) =>
              setTimeout(() => {
                reject(new Error('Authentication timeout after 30 seconds'));
              }, 30000)
            ),
          ]);

          // Skip saving authentication info for now to avoid blocking
          try {
            await Promise.race([AcpConfigManager.saveAuthInfo(this.backend, authMethod.id), new Promise((_, reject) => setTimeout(() => reject(new Error('SaveAuthInfo timeout')), 2000))]);
          } catch (error) {
            console.error('Failed to save auth info:', error);
          }

          this.emitStatusMessage('authenticated', `Authenticated with ${this.backend} using ${authMethod.name}`);
          return;
        } catch (error) {
          // If this is an internal error, it might be a protocol issue
          if (error instanceof Error && error.message.includes('Internal error')) {
            // For Gemini, check if it's the GOOGLE_CLOUD_PROJECT issue
            if (this.backend === 'gemini' && error.message.includes('GOOGLE_CLOUD_PROJECT')) {
              this.emitStatusMessage('error', `Authentication failed: GOOGLE_CLOUD_PROJECT environment variable required. ` + `Please set it or use API key authentication. See: https://goo.gle/gemini-cli-auth-docs#workspace-gca`);
            } else {
              this.emitStatusMessage('error', `Authentication failed: Internal error with ${this.backend} ACP`);
            }
          }
        }
      }
    } catch (error) {
      // Continue without authentication for some backends
    }
  }

  private async updateChatHistory(): Promise<void> {
    try {
      const history = await ProcessChat.get('chat.history');
      
      if (history) {
        const conversationIndex = history.findIndex((conv: any) => conv.id === this.id);
        
        if (conversationIndex >= 0) {
          const updatedHistory = history.map((conv: any) => 
            conv.id === this.id ? { ...conv, modifyTime: this.modifyTime } : conv
          );
          await ProcessChat.set('chat.history', updatedHistory);
        }
      }
    } catch (error) {
      console.error('Failed to update chat history:', error);
    }
  }
}
