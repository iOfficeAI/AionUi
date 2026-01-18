/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NetworkError, CodexEventEnvelope } from '@/agent/codex/connection/CodexConnection';
import { CodexConnection } from '@/agent/codex/connection/CodexConnection';
import type { FileChange, CodexEventParams, CodexJsonRpcEvent } from '@/common/codex/types';
import type { CodexEventHandler } from '@/agent/codex/handlers/CodexEventHandler';
import type { CodexSessionManager } from '@/agent/codex/handlers/CodexSessionManager';
import type { CodexFileOperationHandler } from '@/agent/codex/handlers/CodexFileOperationHandler';
import { getConfiguredAppClientName, getConfiguredAppClientVersion, getConfiguredCodexMcpProtocolVersion } from '../../../common/utils/appConfig';
import { lt } from 'semver';

interface LegacyNetworkErrorDetails {
  networkErrorType?: string;
  originalError?: string;
  retryCount?: number;
}

const APP_CLIENT_NAME = getConfiguredAppClientName();
const APP_CLIENT_VERSION = getConfiguredAppClientVersion();
const CODEX_MCP_PROTOCOL_VERSION = getConfiguredCodexMcpProtocolVersion();

export interface CodexAgentConfig {
  id: string;
  cliPath?: string; // e.g. 'codex' or absolute path
  workingDir: string;
  eventHandler: CodexEventHandler;
  sessionManager: CodexSessionManager;
  fileOperationHandler: CodexFileOperationHandler;
  onNetworkError?: (error: NetworkError) => void;
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'; // Filesystem sandbox mode
}

/**
 * Minimal Codex MCP Agent skeleton.
 * Not wired into UI flows yet; provides a starting point for protocol fusion.
 */
export class CodexAgent {
  private readonly id: string;
  private readonly cliPath?: string;
  private readonly workingDir: string;
  private readonly eventHandler: CodexEventHandler;
  private readonly sessionManager: CodexSessionManager;
  private readonly fileOperationHandler: CodexFileOperationHandler;
  private readonly onNetworkError?: (error: NetworkError) => void;
  private readonly sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
  private conn: CodexConnection | null = null;
  private conversationId: string | null = null;

  constructor(cfg: CodexAgentConfig) {
    this.id = cfg.id;
    this.cliPath = cfg.cliPath;
    this.workingDir = cfg.workingDir;
    this.eventHandler = cfg.eventHandler;
    this.sessionManager = cfg.sessionManager;
    this.fileOperationHandler = cfg.fileOperationHandler;
    this.onNetworkError = cfg.onNetworkError;
    this.sandboxMode = cfg.sandboxMode || 'workspace-write'; // Default to workspace-write for file operations
  }

  async start(): Promise<void> {
    this.conn = new CodexConnection();
    this.conn.onEvent = (env) => this.processCodexEvent(env);
    this.conn.onError = (error) => this.handleError(error);

    try {
      // 让 CodexConnection 根据版本自动检测合适的命令 / Let CodexConnection auto-detect the appropriate command based on version
      await this.conn.start(this.cliPath || 'codex', this.workingDir);

      // Wait for MCP server to be fully ready
      await this.conn.waitForServerReady(30000);

      // MCP initialize handshake with better error handling

      // Try different initialization approaches
      try {
        await this.conn.request(
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
          await this.conn.request('tools/list', {}, 10000);
        } catch (testError) {
          throw new Error(`Codex MCP initialization failed: ${initError}. Tools list also failed: ${testError}`);
        }
      }
    } catch (error) {
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

  async newSession(cwd?: string, initialPrompt?: string): Promise<{ sessionId: string }> {
    // Establish Codex conversation via MCP tool call; we will keep the generated ID locally
    const convId = this.conversationId || this.generateConversationId();
    this.conversationId = convId;

    const maxRetries = 3;
    let lastError: Error | null = null;

    // Prepare arguments based on version
    const args: Record<string, any> = {
      prompt: initialPrompt || '',
      cwd: cwd || this.workingDir,
      sandbox: this.sandboxMode, // 强制指定沙盒模式
    };

    // Restore web_search_request for older versions (< 0.40.0)
    // Codex CLI 0.40.0+ (mcp-server) handles web_search configuration internally and errors on duplicate field
    const currentVersion = this.conn?.getVersion();
    if (currentVersion && lt(currentVersion, '0.40.0')) {
      args.config = {
        tools: {
          web_search_request: true,
        },
      };
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.conn?.request(
          'tools/call',
          {
            name: 'codex',
            arguments: args,
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
          break;
        }

        if (attempt === maxRetries) {
          break;
        }

        // 指数退避：2s, 4s, 8s
        const delay = 2000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // 如果所有重试都失败，但连接可能仍然有效，只记录错误而不抛出

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
        // 对于致命错误，直接抛出，不进行重试
        throw error;
      }

      // 对于非超时、非致命错误，仍然抛出
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
        // Pass the original env object directly since it's already CodexJsonRpcEvent structure
        this.eventHandler.handleEvent(env as CodexJsonRpcEvent);
      } catch {
        // Event handling failed, continue processing
      }

      if (msg.type === 'session_configured' && msg.session_id) {
        this.conversationId = String(msg.session_id);
      }
      return;
    }
  }

  private handleError(error: { message: string; type?: 'network' | 'stream' | 'timeout' | 'process'; details?: unknown }): void {
    // 统一错误处理，直接调用 MessageProcessor 的错误处理方法
    try {
      if (error.type === 'network') {
        // 网络错误特殊处理，如果有外部处理器则优先使用
        if (this.onNetworkError) {
          const networkError = this.convertToLegacyNetworkError(error);
          this.onNetworkError(networkError);
        } else {
          // 网络错误也通过流错误处理
          const errorMessage = `Network Error: ${error.message}`;
          this.eventHandler.getMessageProcessor().processStreamError(errorMessage);
        }
      } else {
        // 其他错误类型统一处理
        this.eventHandler.getMessageProcessor().processStreamError(error.message);
      }
    } catch {
      // Error handling failed, continue processing
    }
  }

  private convertToLegacyNetworkError(error: { message: string; type?: string; details?: LegacyNetworkErrorDetails }): NetworkError {
    const details = error.details || {};
    return {
      type: this.mapNetworkErrorType(details.networkErrorType || 'unknown'),
      originalError: details.originalError || error.message,
      retryCount: details.retryCount || 0,
      suggestedAction: error.message,
    };
  }

  private mapNetworkErrorType(type: string): NetworkError['type'] {
    switch (type) {
      case 'cloudflare_blocked':
        return 'cloudflare_blocked';
      case 'network_timeout':
        return 'network_timeout';
      case 'connection_refused':
        return 'connection_refused';
      default:
        return 'unknown';
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
  public getDiagnostics(): ReturnType<CodexConnection['getDiagnostics']> {
    const diagnostics = this.conn?.getDiagnostics();
    if (diagnostics) return diagnostics;
    return {
      isConnected: false,
      childProcess: false,
      pendingRequests: 0,
      elicitationCount: 0,
      isPaused: false,
      retryCount: 0,
      hasNetworkError: false,
    };
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
