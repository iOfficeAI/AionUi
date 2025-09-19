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

  // Callbacks
  public onEvent: (evt: CodexEventEnvelope) => void = () => {};
  public onNetworkError: (error: NetworkError) => void = () => {};

  // Permission request handling - similar to ACP's mechanism
  private isPaused = false;
  private pauseReason = '';
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
          // console.log('[Codex MCP]==============>', msg);
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

  async request(method: string, params?: any, timeoutMs = 60000): Promise<any> {
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

      // Debug logging for error detection
      console.log('🔍 [CodexMcpConnection] Response debug:', {
        hasError: !!res.error,
        hasResult: !!res.result,
        resultHasError: !!(res.result && res.result.error),
        errorMessage: res.error?.message,
        resultError: res.result?.error,
      });

      if (res.error) {
        const errorMsg = res.error.message || '';
        console.log('🔍 [CodexMcpConnection] Checking res.error.message:', errorMsg);

        // Check for network-related errors
        if (this.isNetworkRelatedError(errorMsg)) {
          console.log('✅ [CodexMcpConnection] Network error detected in res.error');
          this.handleNetworkError(errorMsg, p);
        } else {
          console.log('❌ [CodexMcpConnection] Not recognized as network error in res.error');
          p.reject(new Error(errorMsg));
        }
      } else if (res.result && res.result.error) {
        const resultErrorMsg = String(res.result.error);
        console.log('🔍 [CodexMcpConnection] Checking res.result.error:', resultErrorMsg.substring(0, 100));

        if (this.isNetworkRelatedError(resultErrorMsg)) {
          console.log('✅ [CodexMcpConnection] Network error detected in res.result.error');
          this.handleNetworkError(resultErrorMsg, p);
        } else {
          console.log('❌ [CodexMcpConnection] Not recognized as network error in res.result.error');
          p.reject(new Error(resultErrorMsg));
        }
      } else {
        p.resolve(res.result);
      }
      return;
    }

    // Event/Notification
    if ('method' in msg) {
      const env: CodexEventEnvelope = { method: msg.method, params: msg.params };

      // Check for permission request events - pause requests but forward to handler
      if (env.method === 'codex/event' && env.params?.msg?.type === 'apply_patch_approval_request') {
        const callId = env.params.msg.call_id || 'unknown';
        this.isPaused = true;
        this.pauseReason = `Waiting for file write permission (${callId})`;
        console.log(`⏸️ [CodexMcpConnection] Paused due to permission request: ${callId}`);
      }

      // Handle elicitation requests - also pause for patch-approval
      if (env.method === 'elicitation/create' && env.params?.codex_elicitation === 'patch-approval') {
        const callId = env.params?.codex_call_id || 'unknown';
        this.isPaused = true;
        this.pauseReason = `Waiting for elicitation response (${callId})`;
        console.log(`⏸️ [CodexMcpConnection] Paused due to elicitation request: ${callId}`);
      }

      // Always forward events to the handler - let transformMessage handle type-specific logic
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

  // Network error detection and handling methods
  private isNetworkRelatedError(errorMsg: string): boolean {
    const networkErrorPatterns = ['unexpected status 403', 'Cloudflare', 'you have been blocked', 'chatgpt.com', 'network error', 'connection refused', 'timeout', 'ECONNREFUSED', 'ETIMEDOUT', 'DNS_PROBE_FINISHED_NXDOMAIN'];

    const lowerErrorMsg = errorMsg.toLowerCase();
    console.log('🔍 [CodexMcpConnection] Checking error patterns for:', lowerErrorMsg.substring(0, 200));

    for (const pattern of networkErrorPatterns) {
      if (lowerErrorMsg.includes(pattern.toLowerCase())) {
        console.log(`✅ [CodexMcpConnection] Found network error pattern: "${pattern}"`);
        return true;
      }
    }

    console.log('❌ [CodexMcpConnection] No network error patterns found');
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

    console.log(`🔄 [CodexMcpConnection] Scheduling retry ${this.retryCount}/${this.maxRetries} in ${this.retryDelay}ms`);

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
