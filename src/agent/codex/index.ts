/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexMcpConnection } from './CodexMcpConnection';

export interface CodexAgentConfig {
  id: string;
  cliPath?: string; // e.g. 'codex' or absolute path
  workingDir: string;
  onEvent: (evt: { type: string; data: any }) => void;
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
  private conn: CodexMcpConnection | null = null;
  private conversationId: string | null = null;

  constructor(cfg: CodexAgentConfig) {
    this.id = cfg.id;
    this.cliPath = cfg.cliPath;
    this.workingDir = cfg.workingDir;
    this.onEvent = cfg.onEvent;
  }

  async start(): Promise<void> {
    this.conn = new CodexMcpConnection();
    this.conn.onEvent = (env) => this.processCodexEvent(env);
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
    await this.conn?.request('tools/call', {
      name: 'codex-reply',
      arguments: { prompt, conversationId: convId },
    });
  }

  private processCodexEvent(env: { method: string; params?: any }): void {
    if (env.method !== 'codex/event') return;
    const msg = env.params?.msg;
    if (!msg) return;

    // Skeleton: forward as a normalized event envelope for future mapping
    this.onEvent({ type: msg.type || 'unknown', data: msg });
    if (msg.type === 'session_configured' && msg.session_id) {
      this.conversationId = msg.session_id;
    }
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
