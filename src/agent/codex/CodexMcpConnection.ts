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

  // Permission request handling - similar to ACP's mechanism
  private isPaused = false;
  private pauseReason = '';
  private pausedRequests: Array<{ method: string; params: any; resolve: any; reject: any; timeout: NodeJS.Timeout }> = [];
  private permissionResolvers = new Map<string, { resolve: (approved: boolean) => void; reject: (error: Error) => void }>();

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

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        // Also remove from paused requests if present
        this.pausedRequests = this.pausedRequests.filter((r) => r.resolve !== resolve);
        reject(new Error(`Codex MCP request timed out: ${method}`));
      }, timeoutMs);

      // If connection is paused, queue the request
      if (this.isPaused) {
        console.log(`🚫 [CodexMcpConnection] Request ${method} paused due to: ${this.pauseReason}`);
        this.pausedRequests.push({ method, params, resolve, reject, timeout });
        return;
      }

      // Normal request processing
      this.pending.set(id, { resolve, reject, timeout });
      const line = JSON.stringify(req) + '\n';
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

      // Check for permission request events before forwarding
      if (env.method === 'codex/event' && env.params?.msg?.type === 'apply_patch_approval_request') {
        this.handlePermissionRequest(env.params.msg);
        return;
      }

      this.onEvent(env);
    }
  }

  // Permission handling methods (similar to ACP)
  private handlePermissionRequest(data: any): void {
    const callId = data.call_id || 'unknown';

    // Pause all future requests until permission is granted
    this.isPaused = true;
    this.pauseReason = `Waiting for file write permission (${callId})`;

    console.log(`⏸️ [CodexMcpConnection] Paused due to permission request: ${callId}`);

    // Forward the permission request to the agent manager
    this.onEvent({
      method: 'codex/event',
      params: { msg: { ...data, type: 'apply_patch_approval_request' } },
    });
  }

  // Public methods for permission control
  public async waitForPermission(callId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.permissionResolvers.set(callId, { resolve, reject });

      // Auto-timeout after 30 seconds
      setTimeout(() => {
        if (this.permissionResolvers.has(callId)) {
          this.permissionResolvers.delete(callId);
          reject(new Error('Permission request timed out'));
        }
      }, 30000);
    });
  }

  public resolvePermission(callId: string, approved: boolean): void {
    const resolver = this.permissionResolvers.get(callId);
    if (resolver) {
      this.permissionResolvers.delete(callId);
      resolver.resolve(approved);
    }

    // Resume paused requests
    this.resumeRequests();
  }

  private resumeRequests(): void {
    if (!this.isPaused) return;

    console.log(`▶️ [CodexMcpConnection] Resuming ${this.pausedRequests.length} paused requests`);

    this.isPaused = false;
    this.pauseReason = '';

    // Process all paused requests
    const requests = [...this.pausedRequests];
    this.pausedRequests = [];

    for (const req of requests) {
      const id = this.nextId++;
      const jsonReq: JsonRpcRequest = { jsonrpc: '2.0', id, method: req.method, params: req.params };

      this.pending.set(id, { resolve: req.resolve, reject: req.reject, timeout: req.timeout });
      const line = JSON.stringify(jsonReq) + '\n';
      this.child?.stdin?.write(line);
    }
  }
}
