/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NetworkError, CodexEventEnvelope } from '@/agent/codex/connection/CodexMcpConnection';
import { CodexMcpConnection } from '@/agent/codex/connection/CodexMcpConnection';
import { APP_CLIENT_NAME, APP_CLIENT_VERSION, CODEX_MCP_PROTOCOL_VERSION } from '@/common/constants';
import type { FileChange, CodexEventParams } from '@/common/codexTypes';
import type { CodexEventHandler } from '@/agent/codex/handlers/CodexEventHandler';
import type { CodexSessionManager } from '@/agent/codex/handlers/CodexSessionManager';
import type { CodexFileOperationHandler } from '@/agent/codex/handlers/CodexFileOperationHandler';

export interface CodexAgentConfig {
  id: string;
  cliPath?: string; // e.g. 'codex' or absolute path
  workingDir: string;
  eventHandler: CodexEventHandler;
  sessionManager: CodexSessionManager;
  fileOperationHandler: CodexFileOperationHandler;
  onNetworkError?: (error: NetworkError) => void;
}

/**
 * Minimal Codex MCP Agent skeleton.
 * Not wired into UI flows yet; provides a starting point for protocol fusion.
 */
export class CodexMcpAgent {
  private readonly id: string;
  private readonly cliPath?: string;
  private readonly workingDir: string;
  private readonly eventHandler: CodexEventHandler;
  private readonly sessionManager: CodexSessionManager;
  private readonly fileOperationHandler: CodexFileOperationHandler;
  private readonly onNetworkError?: (error: NetworkError) => void;
  private conn: CodexMcpConnection | null = null;
  private conversationId: string | null = null;

  constructor(cfg: CodexAgentConfig) {
    this.id = cfg.id;
    this.cliPath = cfg.cliPath;
    this.workingDir = cfg.workingDir;
    this.eventHandler = cfg.eventHandler;
    this.sessionManager = cfg.sessionManager;
    this.fileOperationHandler = cfg.fileOperationHandler;
    this.onNetworkError = cfg.onNetworkError;
  }

  async start(): Promise<void> {
    this.conn = new CodexMcpConnection();
    this.conn.onEvent = (env) => this.processCodexEvent(env);
    this.conn.onNetworkError = (error) => this.handleNetworkError(error);

    try {
      // console.log('🔌 [CodexMcpAgent] Starting MCP connection...');
      await this.conn.start(this.cliPath || 'codex', this.workingDir);
      // console.log('✅ [CodexMcpAgent] MCP connection established');

      // Wait for MCP server to be fully ready
      // console.log('⏳ [CodexMcpAgent] Waiting for MCP server to be ready...');
      await this.conn.waitForServerReady(30000);
      // console.log('✅ [CodexMcpAgent] MCP server is ready');

      // MCP initialize handshake with better error handling
      // console.log('🤝 [CodexMcpAgent] Starting initialize handshake...');

      // console.log('🔧 [CodexMcpAgent] Connection diagnostics before initialize:', this.conn.getDiagnostics());

      // console.log('📤 [CodexMcpAgent] Sending initialize with protocol version:', CODEX_MCP_PROTOCOL_VERSION);

      // Try different initialization approaches
      try {
        const initializeResult = await this.conn.request(
          'initialize',
          {
            protocolVersion: CODEX_MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: APP_CLIENT_NAME, version: APP_CLIENT_VERSION },
          },
          15000
        ); // Shorter timeout for faster fallback
      } catch (initError) {
        try {
          // Try without initialize - maybe Codex doesn't need it
          const testResult = await this.conn.request('tools/list', {}, 10000);
        } catch (testError) {
          throw new Error(`Codex MCP initialization failed: ${initError}. Tools list also failed: ${testError}`);
        }
      }
    } catch (error) {
      console.error('❌ [CodexMcpAgent] Start failed:', error);

      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('timed out')) {
          throw new Error('Codex initialization timed out. This may indicate:\n' + '1. Codex CLI is not responding\n' + '2. Network connectivity issues\n' + '3. Authentication problems\n' + 'Please check: codex auth status, network connection, and try again.');
        } else if (error.message.includes('command not found')) {
          throw new Error("Codex CLI not found. Please install Codex CLI and ensure it's in your PATH.");
        } else if (error.message.includes('authentication')) {
          throw new Error('Codex authentication required. Please run "codex auth" to authenticate.');
        }
      }

      // Re-throw the original error if no specific handling applies
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.conn?.stop();
    this.conn = null;
  }

  /**
   * 检查是否为致命错误，不应该重试
   */
  private isFatalError(errorMessage: string): boolean {
    const fatalErrorPatterns = [
      "You've hit your usage limit", // 使用限制错误
      'authentication failed', // 认证失败
      'unauthorized', // 未授权
      'forbidden', // 禁止访问
      'invalid api key', // API key无效
      'account suspended', // 账户被暂停
    ];

    const lowerErrorMsg = errorMessage.toLowerCase();

    for (const pattern of fatalErrorPatterns) {
      if (lowerErrorMsg.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  async newSession(cwd?: string): Promise<{ sessionId: string }> {
    // Establish Codex conversation via MCP tool call; we will keep the generated ID locally
    const convId = this.conversationId || this.generateConversationId();
    this.conversationId = convId;

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.conn?.request(
          'tools/call',
          {
            name: 'codex',
            arguments: {
              prompt: 'Hello from AionUi',
              cwd: cwd || this.workingDir,
            },
            config: { conversationId: convId },
          },
          600000
        ); // 10分钟超时

        return { sessionId: convId };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 检查是否为不可重试的错误类型
        const errorMessage = lastError.message;
        const isFatalError = this.isFatalError(errorMessage);

        if (isFatalError) {
          console.warn(`⚠️ [CodexMcpAgent] Fatal error detected, stopping retries: ${errorMessage}`);
          break;
        }

        if (attempt === maxRetries) {
          console.error(`🔥 [CodexMcpAgent] All ${maxRetries} attempts failed, giving up`);
          break;
        }

        console.warn(`⚠️ [CodexMcpAgent] Attempt ${attempt}/${maxRetries} failed, retrying...`);

        // 指数退避：2s, 4s, 8s
        const delay = 2000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // 如果所有重试都失败，但连接可能仍然有效，只记录错误而不抛出
    console.warn(`⚠️ [CodexMcpAgent] newSession failed after ${maxRetries} attempts, but continuing with session: ${convId}`);
    console.warn(`⚠️ [CodexMcpAgent] Last error:`, lastError?.message);

    // 返回会话 ID，让后续流程继续
    return { sessionId: convId };
  }

  async sendPrompt(prompt: string): Promise<void> {
    const convId = this.conversationId || this.generateConversationId();
    this.conversationId = convId;

    try {
      await this.conn?.request(
        'tools/call',
        {
          name: 'codex-reply',
          arguments: { prompt, conversationId: convId },
        },
        600000 // 10分钟超时，避免长任务中断
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 检查是否是超时错误
      if (errorMsg.includes('timed out')) {
        // 不抛出错误，因为从日志看到 reasoning_delta 事件仍在正常到达
        return;
      }

      // 检查是否为致命错误
      const isFatalError = this.isFatalError(errorMsg);
      if (isFatalError) {
        console.warn(`⚠️ [CodexMcpAgent] Fatal error in sendPrompt, not retrying: ${errorMsg}`);
        // 对于致命错误，直接抛出，不进行重试
        throw error;
      }

      // 对于非超时、非致命错误，仍然抛出
      console.error('❌ [CodexMcpAgent] sendPrompt encountered non-timeout error:', errorMsg);
      throw error;
    }
  }

  async sendApprovalResponse(callId: string, approved: boolean, changes: Record<string, FileChange>): Promise<void> {
    await this.conn?.request('apply_patch_approval_response', {
      call_id: callId,
      approved,
      changes,
    });
  }

  resolvePermission(callId: string, approved: boolean): void {
    this.conn?.resolvePermission(callId, approved);
  }

  respondElicitation(callId: string, decision: 'approved' | 'approved_for_session' | 'denied' | 'abort'): void {
    this.conn?.respondElicitation(callId, decision);
  }

  private processCodexEvent(env: CodexEventEnvelope): void {
    // Handle codex/event messages (wrapped messages)
    if (env.method === 'codex/event') {
      const params = (env.params || {}) as CodexEventParams;
      const msg = params?.msg;
      if (!msg) {
        return;
      }

      try {
        // Forward as a normalized event envelope for future mapping
        // Include _meta information from the original event for proper request tracking
        const enrichedData = {
          ...msg,
          _meta: params?._meta, // Pass through meta information like requestId
        };
        this.eventHandler.handleEvent({ type: msg.type || 'unknown', data: enrichedData });
      } catch (error) {
        console.error('❌ [CodexMcpAgent] Event handling failed:', error);
      }

      if (msg.type === 'session_configured' && msg.session_id) {
        this.conversationId = String(msg.session_id);
      }
      return;
    }

    // Handle direct elicitation/create messages
    if (env.method === 'elicitation/create') {
      try {
        // Forward the elicitation request directly via eventHandler
        this.eventHandler.handleEvent({ type: 'elicitation/create', data: env.params });
      } catch (error) {
        console.error('❌ [CodexMcpAgent] Elicitation handling failed:', error);
      }
      return;
    }
  }

  private handleNetworkError(error: NetworkError): void {
    // Forward network error to the parent handler
    if (this.onNetworkError) {
      this.onNetworkError(error);
    } else {
      // Fallback: delegate to event handler
      try {
        this.eventHandler.handleEvent({
          type: 'network_error',
          data: {
            errorType: error.type,
            message: error.suggestedAction,
            originalError: error.originalError,
            retryCount: error.retryCount,
          },
        });
      } catch (handlingError) {
        console.error('❌ [CodexMcpAgent] Network error handling failed:', handlingError);
      }
    }
  }

  // Public method to reset network error state
  public resetNetworkError(): void {
    this.conn?.resetNetworkError();
  }

  // Public method to check network error state
  public hasNetworkError(): boolean {
    return this.conn?.hasNetworkError() || false;
  }

  private generateConversationId(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const crypto = require('crypto');
      if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      const buf = crypto.randomBytes(8).toString('hex');
      return `conv-${Date.now()}-${buf}`;
    } catch {
      // Final fallback without insecure randomness; keep it monotonic & unique-enough for session scoping
      const ts = Date.now().toString(36);
      const pid = typeof process !== 'undefined' && process.pid ? process.pid.toString(36) : 'p';
      return `conv-${ts}-${pid}`;
    }
  }

  // Expose connection diagnostics for UI/manager without leaking internals
  public getDiagnostics(): ReturnType<CodexMcpConnection['getDiagnostics']> {
    return (
      this.conn?.getDiagnostics() || {
        isConnected: false,
        childProcess: false,
        pendingRequests: 0,
        elicitationCount: 0,
        isPaused: false,
        retryCount: 0,
        hasNetworkError: false,
      }
    );
  }

  // Expose handler access for CodexAgentManager
  public getEventHandler(): CodexEventHandler {
    return this.eventHandler;
  }

  public getSessionManager(): CodexSessionManager {
    return this.sessionManager;
  }

  public getFileOperationHandler(): CodexFileOperationHandler {
    return this.fileOperationHandler;
  }
}
