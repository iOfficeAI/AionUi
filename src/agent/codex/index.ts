/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NetworkError } from './CodexMcpConnection';
import { CodexMcpConnection } from './CodexMcpConnection';

export interface CodexAgentConfig {
  id: string;
  cliPath?: string; // e.g. 'codex' or absolute path
  workingDir: string;
  onEvent: (evt: { type: string; data: any }) => void;
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
  private readonly onEvent: (evt: { type: string; data: any }) => void;
  private readonly onNetworkError?: (error: NetworkError) => void;
  private conn: CodexMcpConnection | null = null;
  private conversationId: string | null = null;

  constructor(cfg: CodexAgentConfig) {
    this.id = cfg.id;
    this.cliPath = cfg.cliPath;
    this.workingDir = cfg.workingDir;
    this.onEvent = cfg.onEvent;
    this.onNetworkError = cfg.onNetworkError;
  }

  async start(): Promise<void> {
    this.conn = new CodexMcpConnection();
    this.conn.onEvent = (env) => this.processCodexEvent(env);
    this.conn.onNetworkError = (error) => this.handleNetworkError(error);
    await this.conn.start(this.cliPath || 'codex', this.workingDir);

    // MCP initialize handshake
    await this.conn.request('initialize', {
      protocolVersion: '1.0.0',
      capabilities: {},
      clientInfo: { name: 'AionUi', version: '0.0.0' },
    });
  }

  async stop(): Promise<void> {
    await this.conn?.stop();
    this.conn = null;
  }

  async newSession(cwd?: string): Promise<{ sessionId: string }> {
    // Establish Codex conversation via MCP tool call; we will keep the generated ID locally
    const convId = this.conversationId || this.generateConversationId();
    this.conversationId = convId;
    await this.conn?.request('tools/call', {
      name: 'codex',
      arguments: {
        prompt: 'Hello from AionUi',
        cwd: cwd || this.workingDir,
      },
      config: { conversationId: convId },
    });
    return { sessionId: convId };
  }

  async sendPrompt(prompt: string): Promise<void> {
    const convId = this.conversationId || this.generateConversationId();
    this.conversationId = convId;

    await this.conn?.request(
      'tools/call',
      {
        name: 'codex-reply',
        arguments: { prompt, conversationId: convId },
      },
      60000
    ); // 增加到60秒超时
  }

  async sendApprovalResponse(callId: string, approved: boolean, changes: Record<string, any>): Promise<void> {
    await this.conn?.request('apply_patch_approval_response', {
      call_id: callId,
      approved,
      changes,
    });
  }

  resolvePermission(callId: string, approved: boolean): void {
    this.conn?.resolvePermission(callId, approved);
  }

  private processCodexEvent(env: { method: string; params?: any }): void {
    // Handle codex/event messages (wrapped messages)
    if (env.method === 'codex/event') {
      const msg = env.params?.msg;
      if (!msg) {
        return;
      }

      try {
        // Forward as a normalized event envelope for future mapping
        // Include _meta information from the original event for proper request tracking
        const enrichedData = {
          ...msg,
          _meta: env.params?._meta, // Pass through meta information like requestId
        };
        this.onEvent({ type: msg.type || 'unknown', data: enrichedData });
      } catch {
        // Ignore errors in event processing
      }

      if (msg.type === 'session_configured' && msg.session_id) {
        this.conversationId = msg.session_id;
      }
      return;
    }

    // Handle direct elicitation/create messages
    if (env.method === 'elicitation/create') {
      try {
        // Forward the elicitation request directly
        this.onEvent({ type: 'elicitation/create', data: env.params });
      } catch {
        // Ignore errors in elicitation processing
      }
      return;
    }
  }

  private handleNetworkError(error: NetworkError): void {
    // Forward network error to the parent handler
    if (this.onNetworkError) {
      this.onNetworkError(error);
    } else {
      // Fallback: emit as a regular event
      this.onEvent({
        type: 'network_error',
        data: {
          errorType: error.type,
          message: error.suggestedAction,
          originalError: error.originalError,
          retryCount: error.retryCount,
        },
      });
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
}
