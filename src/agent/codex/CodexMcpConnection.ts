/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { JSONRPC_VERSION } from '@/common/acpTypes';

type JsonRpcId = number | string;

interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id?: JsonRpcId;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export interface CodexEventEnvelope {
  method: string; // e.g. "codex/event"
  params?: any;
}

export interface NetworkError {
  type: 'cloudflare_blocked' | 'network_timeout' | 'connection_refused' | 'unknown';
  originalError: string;
  retryCount: number;
  suggestedAction: string;
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
  private elicitationMap = new Map<string, JsonRpcId>(); // codex_call_id -> request id

  // Callbacks
  public onEvent: (evt: CodexEventEnvelope) => void = () => {};
  public onNetworkError: (error: NetworkError) => void = () => {};

  // Permission request handling - similar to ACP's mechanism
  private isPaused = false;
  private pausedRequests: Array<{ method: string; params: any; resolve: any; reject: any; timeout: NodeJS.Timeout }> = [];
  private permissionResolvers = new Map<string, { resolve: (approved: boolean) => void; reject: (error: Error) => void }>();

  // Network error handling
  private retryCount = 0;
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds
  private isNetworkError = false;

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
    // Clear pending elicitations
    this.elicitationMap.clear();
  }

  async request(method: string, params?: any, timeoutMs = 120000): Promise<any> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: JSONRPC_VERSION, id, method, params };

    console.log(`🕒 [CodexMcpConnection] Request ${method} with timeout: ${timeoutMs}ms, id: ${id}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        // Also remove from paused requests if present
        this.pausedRequests = this.pausedRequests.filter((r) => r.resolve !== resolve);
        console.error(`⏰ [CodexMcpConnection] Request ${method} timed out after ${timeoutMs}ms`);
        reject(new Error(`Codex MCP request timed out: ${method}`));
      }, timeoutMs);

      // If connection is paused, queue the request
      if (this.isPaused) {
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
    const msg: JsonRpcRequest = { jsonrpc: JSONRPC_VERSION, method, params };
    const line = JSON.stringify(msg) + '\n';
    this.child?.stdin?.write(line);
  }

  private handleIncoming(msg: any): void {
    if (typeof msg !== 'object' || msg === null) return;

    console.log('🔄 [CodexMcpConnection] Handling incoming message:', JSON.stringify(msg, null, 2));

    // Response
    if ('id' in msg && (msg.result !== undefined || msg.error !== undefined)) {
      const res = msg as JsonRpcResponse;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (p.timeout) clearTimeout(p.timeout);

      if (res.error) {
        const errorMsg = res.error.message || '';
        console.log(`❌ [CodexMcpConnection] Response error for id ${res.id}:`, errorMsg);

        // Check for network-related errors
        if (this.isNetworkRelatedError(errorMsg)) {
          this.handleNetworkError(errorMsg, p);
        } else {
          p.reject(new Error(errorMsg));
        }
      } else if (res.result && res.result.error) {
        const resultErrorMsg = String(res.result.error);
        console.log(`❌ [CodexMcpConnection] Result error for id ${res.id}:`, resultErrorMsg);

        if (this.isNetworkRelatedError(resultErrorMsg)) {
          this.handleNetworkError(resultErrorMsg, p);
        } else {
          p.reject(new Error(resultErrorMsg));
        }
      } else {
        console.log(`✅ [CodexMcpConnection] Response success for id ${res.id}`);
        p.resolve(res.result);
      }
      return;
    }

    // Event/Notification
    if ('method' in msg) {
      const env: CodexEventEnvelope = { method: msg.method, params: msg.params };

      // Check for permission request events - pause requests but forward to handler
      if (env.method === 'codex/event' && env.params?.msg?.type === 'apply_patch_approval_request') {
        this.isPaused = true;
      }

      // Handle elicitation requests - pause and record mapping from codex_call_id -> request id
      if (env.method === 'elicitation/create' && 'id' in msg) {
        console.log('🔐 [CodexMcpConnection] Received elicitation/create');
        this.isPaused = true;
        const reqId = msg.id as JsonRpcId;
        const codexCallId = env.params?.codex_call_id || env.params?.call_id;
        if (codexCallId) {
          this.elicitationMap.set(String(codexCallId), reqId);
          console.log('💾 [CodexMcpConnection] Map elicitation call_id -> reqId', codexCallId, reqId);
        }
      }

      // Always forward events to the handler - let transformMessage handle type-specific logic
      console.log('📤 [CodexMcpConnection] Forwarding event to handler:', env.method);
      this.onEvent(env);
    }
  }

  // Permission control methods

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

    // Send elicitation response for any pending elicitations
    const decision = approved ? 'approved' : 'denied';
    this.respondElicitation(callId, decision as any);

    // Resume paused requests
    this.resumeRequests();
  }

  public respondElicitation(callId: string, decision: 'approved' | 'approved_for_session' | 'denied' | 'abort'): void {
    // Accept uniqueId formats like 'patch_<id>' / 'elicitation_<id>' as well
    const normalized = callId.replace(/^patch_/, '').replace(/^elicitation_/, '');
    const reqId = this.elicitationMap.get(normalized) || this.elicitationMap.get(callId);
    if (reqId === undefined) {
      console.warn('[CodexMcpConnection] No elicitation request id found for callId:', callId);
      return;
    }
    const result = { decision };
    const response = { jsonrpc: JSONRPC_VERSION, id: reqId, result } as any;
    const line = JSON.stringify(response) + '\n';
    this.child?.stdin?.write(line);
    this.elicitationMap.delete(normalized);
  }

  private resumeRequests(): void {
    if (!this.isPaused) return;

    this.isPaused = false;

    // Process all paused requests
    const requests = [...this.pausedRequests];
    this.pausedRequests = [];

    for (const req of requests) {
      const id = this.nextId++;
      const jsonReq: JsonRpcRequest = { jsonrpc: JSONRPC_VERSION, id, method: req.method, params: req.params };

      this.pending.set(id, { resolve: req.resolve, reject: req.reject, timeout: req.timeout });
      const line = JSON.stringify(jsonReq) + '\n';
      this.child?.stdin?.write(line);
    }
  }

  // Network error detection and handling methods
  private isNetworkRelatedError(errorMsg: string): boolean {
    const networkErrorPatterns = ['unexpected status 403', 'Cloudflare', 'you have been blocked', 'chatgpt.com', 'network error', 'connection refused', 'timeout', 'ECONNREFUSED', 'ETIMEDOUT', 'DNS_PROBE_FINISHED_NXDOMAIN'];

    const lowerErrorMsg = errorMsg.toLowerCase();

    for (const pattern of networkErrorPatterns) {
      if (lowerErrorMsg.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  private handleNetworkError(errorMsg: string, pendingRequest: PendingReq): void {
    const networkError = this.classifyNetworkError(errorMsg);

    console.error(`🌐 [CodexMcpConnection] Network error detected:`, networkError);

    // Emit network error for UI handling
    this.onNetworkError(networkError);

    // Decide whether to retry or fail immediately
    if (this.retryCount < this.maxRetries && networkError.type !== 'cloudflare_blocked') {
      this.scheduleRetry(pendingRequest, networkError);
    } else {
      // Max retries reached or unrecoverable error
      this.isNetworkError = true;
      pendingRequest.reject(new Error(`${networkError.type}: ${networkError.originalError}`));
    }
  }

  private classifyNetworkError(errorMsg: string): NetworkError {
    const lowerMsg = errorMsg.toLowerCase();

    if (lowerMsg.includes('403') && lowerMsg.includes('cloudflare')) {
      return {
        type: 'cloudflare_blocked',
        originalError: errorMsg,
        retryCount: this.retryCount,
        suggestedAction: 'cloudflare_blocked',
      };
    }

    if (lowerMsg.includes('timeout') || lowerMsg.includes('etimedout')) {
      return {
        type: 'network_timeout',
        originalError: errorMsg,
        retryCount: this.retryCount,
        suggestedAction: 'network_timeout',
      };
    }

    if (lowerMsg.includes('connection refused') || lowerMsg.includes('econnrefused')) {
      return {
        type: 'connection_refused',
        originalError: errorMsg,
        retryCount: this.retryCount,
        suggestedAction: 'connection_refused',
      };
    }

    return {
      type: 'unknown',
      originalError: errorMsg,
      retryCount: this.retryCount,
      suggestedAction: 'unknown_error',
    };
  }

  private scheduleRetry(pendingRequest: PendingReq, networkError: NetworkError): void {
    this.retryCount++;

    setTimeout(() => {
      // Emit retry notification
      this.onNetworkError({
        ...networkError,
        retryCount: this.retryCount,
        suggestedAction: 'retry_attempt',
      });

      // For now, still reject since we can't easily replay the original request
      // In a more sophisticated implementation, you'd store and replay the original request
      pendingRequest.reject(new Error(`Network error after ${this.retryCount} retries: ${networkError.type}`));
    }, this.retryDelay);
  }

  // Public method to reset network error state
  public resetNetworkError(): void {
    this.retryCount = 0;
    this.isNetworkError = false;
  }

  // Public method to check if currently in network error state
  public hasNetworkError(): boolean {
    return this.isNetworkError;
  }
}
