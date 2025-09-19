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
    console.log('🏗️ [CodexMcpAgent] Constructor: onEvent callback set:', typeof this.onEvent);
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
    console.log(`📤 [CodexMcpAgent] Sending prompt to Codex MCP:`, { prompt, conversationId: convId });

    try {
      const result = await this.conn?.request(
        'tools/call',
        {
          name: 'codex-reply',
          arguments: { prompt, conversationId: convId },
        },
        60000
      ); // 增加到60秒超时
      console.log(`📥 [CodexMcpAgent] Codex MCP request result:`, result);
    } catch (error) {
      console.error(`❌ [CodexMcpAgent] Codex MCP request failed:`, error);
      throw error;
    }
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
    console.log('🔎 [CodexMcpAgent] Received raw event:', env);
    console.log('🔥 [CodexMcpAgent] DEBUG: processCodexEvent called - CODE VERSION 2025-01-19');

    // Handle codex/event messages (wrapped messages)
    if (env.method === 'codex/event') {
      const msg = env.params?.msg;
      if (!msg) {
        console.log('❌ [CodexMcpAgent] No message in codex/event params');
        return;
      }

      console.log('📨 [CodexMcpAgent] Processing codex/event:', { type: msg.type, data: msg });
      console.log('🔧 [CodexMcpAgent] onEvent callback type:', typeof this.onEvent);
      console.log('🔧 [CodexMcpAgent] onEvent callback available:', !!this.onEvent);
      console.log('🔧 [CodexMcpAgent] About to check try-catch block');

      try {
        // Forward as a normalized event envelope for future mapping
        // Include _meta information from the original event for proper request tracking
        const enrichedData = {
          ...msg,
          _meta: env.params?._meta, // Pass through meta information like requestId
        };
        console.log('🚀 [CodexMcpAgent] Forwarding to onEvent:', { type: msg.type || 'unknown', data: enrichedData });
        this.onEvent({ type: msg.type || 'unknown', data: enrichedData });
        console.log('✅ [CodexMcpAgent] Successfully called onEvent');
      } catch (error) {
        console.error('💥 [CodexMcpAgent] Error calling onEvent:', error);
      }

      if (msg.type === 'session_configured' && msg.session_id) {
        this.conversationId = msg.session_id;
      }
      return;
    }

    // Handle direct elicitation/create messages
    if (env.method === 'elicitation/create') {
      console.log('📨 [CodexMcpAgent] Processing elicitation/create:', env.params);
      console.log('🔧 [CodexMcpAgent] elicitation onEvent callback type:', typeof this.onEvent);
      console.log('🔧 [CodexMcpAgent] elicitation onEvent callback available:', !!this.onEvent);

      try {
        // Forward the elicitation request directly
        console.log('🚀 [CodexMcpAgent] Forwarding elicitation to onEvent:', { type: 'elicitation/create', data: env.params });
        this.onEvent({ type: 'elicitation/create', data: env.params });
        console.log('✅ [CodexMcpAgent] Successfully called elicitation onEvent');
      } catch (error) {
        console.error('💥 [CodexMcpAgent] Error calling elicitation onEvent:', error);
      }
      return;
    }

    // Log unhandled methods for debugging
    console.log('❓ [CodexMcpAgent] Unhandled method:', env.method);
  }

  private handleNetworkError(error: NetworkError): void {
    console.error('🌐 [CodexMcpAgent] Network error:', error);

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
      return require('crypto').randomUUID();
    } catch {
      return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
  }
}
