/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';

type JsonRpcId = number | string;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export interface CodexEventEnvelope {
  method: string; // e.g. "codex/event"
  params?: any;
}

interface PendingReq {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  timeout?: NodeJS.Timeout;
}

export class CodexMcpConnection {
  private child: ChildProcess | null = null;
  private nextId = 0;
  private pending = new Map<JsonRpcId, PendingReq>();

  // Callbacks
  public onEvent: (evt: CodexEventEnvelope) => void = () => {};

  async start(cliPath: string, cwd: string, args: string[] = []): Promise<void> {
    // Default to "codex mcp"
    const command = cliPath || 'codex';
    const finalArgs = args.length ? args : ['mcp'];

    this.child = spawn(command, finalArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stderr?.on('data', (d) => {
      // eslint-disable-next-line no-console
      console.error('[Codex MCP STDERR]', d.toString());
    });

    let buffer = '';
    this.child.stdout?.on('data', (d) => {
      buffer += d.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as any;
          this.handleIncoming(msg);
        } catch {
          // ignore
        }
      }
    });
  }

  async stop(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    // Reject all pending
    for (const [id, p] of this.pending) {
      p.reject(new Error('Codex MCP connection closed'));
      if (p.timeout) clearTimeout(p.timeout);
      this.pending.delete(id);
    }
  }

  async request(method: string, params?: any, timeoutMs = 15000): Promise<any> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const line = JSON.stringify(req) + '\n';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex MCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.child?.stdin?.write(line);
    });
  }

  notify(method: string, params?: any): void {
    const msg: JsonRpcRequest = { jsonrpc: '2.0', method, params };
    const line = JSON.stringify(msg) + '\n';
    this.child?.stdin?.write(line);
  }

  private handleIncoming(msg: any): void {
    if (typeof msg !== 'object' || msg === null) return;

    // Response
    if ('id' in msg && (msg.result !== undefined || msg.error !== undefined)) {
      const res = msg as JsonRpcResponse;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (p.timeout) clearTimeout(p.timeout);
      if (res.error) p.reject(new Error(res.error.message));
      else p.resolve(res.result);
      return;
    }

    // Event/Notification
    if ('method' in msg) {
      const env: CodexEventEnvelope = { method: msg.method, params: msg.params };
      this.onEvent(env);
    }
  }
}
