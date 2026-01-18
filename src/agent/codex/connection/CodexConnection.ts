/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'child_process';
import { spawn, execSync } from 'child_process';
import type { CodexEventParams } from '@/common/codex/types';
import { globalErrorService, fromNetworkError } from '../core/ErrorService';
import { JSONRPC_VERSION } from '@/types/acpTypes';

type JsonRpcId = number | string;

interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface CodexEventEnvelope {
  method: string; // e.g. "codex/event" or "elicitation/create"
  params?: unknown;
}

// Legacy NetworkError interface for backward compatibility
export interface NetworkError {
  type: 'cloudflare_blocked' | 'network_timeout' | 'connection_refused' | 'unknown';
  originalError: string;
  retryCount: number;
  suggestedAction: string;
}

interface PendingReq {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timeout?: NodeJS.Timeout;
}

export class CodexConnection {
  private child: ChildProcess | null = null;
  private nextId = 0;
  private pending = new Map<JsonRpcId, PendingReq>();
  private elicitationMap = new Map<string, JsonRpcId>(); // codex_call_id -> request id

  // Callbacks
  public onEvent: (evt: CodexEventEnvelope) => void = () => {};
  public onError: (error: { message: string; type?: 'network' | 'stream' | 'timeout' | 'process'; details?: unknown }) => void = () => {};

  // Permission request handling - similar to ACP's mechanism
  private isPaused = false;
  private pausedRequests: Array<{ method: string; params: unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void; timeout: NodeJS.Timeout }> = [];
  private permissionResolvers = new Map<string, { resolve: (approved: boolean) => void; reject: (error: Error) => void }>();

  // Network error handling
  private retryCount = 0;
  private retryDelay = 5000; // 5 seconds
  private isNetworkError = false;

  private detectedVersion: string | null = null;

  public getVersion(): string | null {
    return this.detectedVersion;
  }

  /**
   * 检测 Codex 版本并返回相应的 MCP 启动命令
   * Detect Codex version and return appropriate MCP command
   * @param cliPath - Codex CLI 路径 / Path to Codex CLI
   * @returns 启动 MCP 服务器的命令参数数组 / Array of command arguments for starting MCP server
   */
  private detectMcpCommand(cliPath: string): string[] {
    try {
      // 尝试获取 Codex 版本 / Try to get Codex version
      const versionOutput = execSync(`${cliPath} --version`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();

      // 提取版本号（例如从 "codex version 0.39.0" 中提取 "0.39.0"）
      // Extract version number (e.g., "0.39.0" from "codex version 0.39.0")
      const versionMatch = versionOutput.match(/(\d+)\.(\d+)\.(\d+)/);
      if (versionMatch) {
        this.detectedVersion = versionMatch[0];
        const [, major, minor] = versionMatch;
        const majorVer = parseInt(major, 10);
        const minorVer = parseInt(minor, 10);

        // 版本 0.40.0 及以上使用 "mcp-server"
        // 版本 0.39.x 及以下使用 "mcp serve"
        // Version 0.40.0 and above use "mcp-server"
        // Version 0.39.x and below use "mcp serve"
        if (majorVer > 0 || (majorVer === 0 && minorVer >= 40)) {
          return ['mcp-server'];
        } else {
          return ['mcp', 'serve'];
        }
      }

      // 如果版本检测失败，默认使用 mcp-server（适用于新版本）
      // If version detection fails, try mcp-server first (for newer versions)
      return ['mcp-server'];
    } catch (error) {
      // 如果版本命令执行失败，默认使用 mcp-server（新版本）
      // If version command fails, default to mcp-server (newer versions)
      return ['mcp-server'];
    }
  }

  start(cliPath: string, cwd: string, args: string[] = []): Promise<void> {
    // 根据 Codex 版本自动检测合适的 MCP 命令 / Auto-detect appropriate MCP command based on Codex version
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_OPTIONS;
    delete cleanEnv.NODE_INSPECT;
    delete cleanEnv.NODE_DEBUG;
    const isWindows = process.platform === 'win32';
    const finalArgs = args.length ? args : this.detectMcpCommand(cliPath);

    return new Promise((resolve, reject) => {
      try {
        this.child = spawn(cliPath, finalArgs, {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            CODEX_NO_INTERACTIVE: '1',
            CODEX_AUTO_CONTINUE: '1',
          },
          shell: isWindows,
        });

        this.child.on('error', (error) => {
          reject(new Error(`Failed to start codex process: ${error.message}`));
        });

        this.child.on('exit', (code, signal) => {
          if (code !== 0 && code !== null) {
            this.handleProcessExit(code, signal);
          }
        });

        this.child.stderr?.on('data', (d) => {
          const errorMsg = d.toString();

          if (errorMsg.includes('command not found') || errorMsg.includes('not recognized')) {
            reject(new Error(`Codex CLI not found. Please ensure 'codex' is installed and in PATH. Error: ${errorMsg}`));
          } else if (errorMsg.includes('permission denied')) {
            reject(new Error(`Permission denied when starting codex. Error: ${errorMsg}`));
          } else if (errorMsg.includes('authentication') || errorMsg.includes('login')) {
            reject(new Error(`Codex authentication required. Please run 'codex auth' first. Error: ${errorMsg}`));
          } else if (errorMsg.includes('unknown flag') || errorMsg.includes('invalid option') || errorMsg.includes('unrecognized')) {
            reject(new Error(`Invalid Codex CLI arguments. Error: ${errorMsg}`));
          }
        });

        let buffer = '';
        let hasOutput = false;
        let receivedJsonMessage = false;

        this.child.stdout?.on('data', (d) => {
          hasOutput = true;
          buffer += d.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;

            console.log('codex line ===>', line);

            // Check if this looks like a JSON-RPC message
            if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
              try {
                const msg = JSON.parse(line) as JsonRpcRequest | JsonRpcResponse;
                receivedJsonMessage = true;
                this.handleIncoming(msg);
              } catch {
                // Ignore parsing errors for non-JSON output
              }
            } else {
              // Handle non-JSON output (startup messages, announcements, etc.)

              // Handle interactive prompts by automatically sending Enter
              if (line.includes('Press Enter to continue')) {
                this.child?.stdin?.write('\n');
              }

              // Force enter MCP mode if we see CLI launch - but stop sending once we see API key passing
              if (line.includes('Launching Codex CLI') && !receivedJsonMessage) {
                setTimeout(() => {
                  if (!receivedJsonMessage) {
                    this.child?.stdin?.write('\n');
                  }
                }, 1000);
              }

              // Detect when MCP server should be ready
              if (line.includes('Passing CODEX_API_KEY')) {
                // Set a flag to indicate the server is starting and wait longer
                setTimeout(() => {
                  receivedJsonMessage = true; // Mark as ready for JSON communication
                }, 5000); // Wait 5 seconds for server to be fully ready
              }
            }
          }
        });

        setTimeout(() => {
          if (this.child && !this.child.killed) {
            resolve();
          } else {
            reject(new Error('Codex process failed to start or was killed during startup'));
          }
        }, 5000);

        // Fallback timeout
        setTimeout(() => {
          if (!hasOutput && this.child && !this.child.killed) {
            resolve(); // Still resolve to allow the connection attempt
          }
        }, 6000); // 6 second fallback
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): Promise<void> {
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
    return Promise.resolve();
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = 200000): Promise<T> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: JSONRPC_VERSION, id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        // Also remove from paused requests if present
        this.pausedRequests = this.pausedRequests.filter((r) => r.resolve !== resolve);

        // Emit error to frontend before rejecting promise
        this.onError({
          message: `Request timed out: ${method} (${timeoutMs}ms)`,
          type: 'timeout',
          details: { method, timeoutMs },
        });

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

      if (this.child?.stdin) {
        this.child.stdin.write(line);
        // Force flush buffer
        if ('flushSync' in this.child.stdin && typeof this.child.stdin.flushSync === 'function') {
          this.child.stdin.flushSync();
        }
      } else {
        reject(new Error('Child process stdin not available'));
        return;
      }
    });
  }

  notify(method: string, params?: unknown): void {
    const msg: JsonRpcRequest = { jsonrpc: JSONRPC_VERSION, method, params };
    const line = JSON.stringify(msg) + '\n';
    this.child?.stdin?.write(line);
  }

  private handleIncoming(msg: JsonRpcRequest | JsonRpcResponse): void {
    if (typeof msg !== 'object' || msg === null) return;

    // Response
    if ('id' in msg && ('result' in (msg as JsonRpcResponse) || 'error' in (msg as JsonRpcResponse))) {
      const res = msg as JsonRpcResponse;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (p.timeout) clearTimeout(p.timeout);

      if (res.error) {
        const errorMsg = res.error.message || '';

        // Check for network-related errors
        if (this.isNetworkRelatedError(errorMsg)) {
          this.handleNetworkError(errorMsg, p);
        } else {
          // Emit error to frontend before rejecting promise
          this.onError({
            message: errorMsg,
            type: 'stream',
            details: { source: 'jsonrpc_error' },
          });
          p.reject(new Error(errorMsg));
        }
      } else if (res.result && typeof res.result === 'object' && 'error' in (res.result as Record<string, unknown>)) {
        const resultErrorMsg = String((res.result as Record<string, unknown>).error);

        if (this.isNetworkRelatedError(resultErrorMsg)) {
          this.handleNetworkError(resultErrorMsg, p);
        } else {
          // Emit error to frontend before rejecting promise
          this.onError({
            message: resultErrorMsg,
            type: 'stream',
            details: { source: 'result_error' },
          });
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

      // Handle all permission request events - pause and record mapping
      if (env.method === 'codex/event' && typeof env.params === 'object' && env.params !== null && 'msg' in (env.params as CodexEventParams)) {
        const msgType = (env.params as CodexEventParams).msg?.type;
        const _callId = (env.params as CodexEventParams).msg?.call_id || (env.params as CodexEventParams).call_id;

        if (msgType === 'apply_patch_approval_request' || msgType === 'exec_approval_request') {
          if ('id' in msg) {
            const reqId = msg.id as JsonRpcId;
            const codexCallId = (env.params as CodexEventParams).msg?.call_id || (env.params as CodexEventParams).call_id;
            if (codexCallId) {
              const callIdStr = String(codexCallId);

              this.elicitationMap.set(callIdStr, reqId);
              this.isPaused = true;
            } else {
              this.isPaused = true;
            }
          }
        }
      }

      // Handle elicitation requests - pause and record mapping from codex_call_id -> request id
      if (env.method === 'elicitation/create' && 'id' in msg) {
        const reqId = msg.id as JsonRpcId;
        const codexCallId = (env.params as CodexEventParams)?.codex_call_id || (env.params as CodexEventParams)?.call_id;
        if (codexCallId) {
          const callIdStr = String(codexCallId);

          this.elicitationMap.set(callIdStr, reqId);
          this.isPaused = true;
        } else {
          this.isPaused = true;
        }
      }

      // Always forward events to the handler - let transformMessage handle type-specific logic
      this.onEvent(env);
    }
  }

  // Permission control methods

  // Public methods for permission control
  public waitForPermission(callId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.permissionResolvers.set(callId, { resolve, reject });

      // Auto-timeout after 30 seconds
      setTimeout(() => {
        if (this.permissionResolvers.has(callId)) {
          this.permissionResolvers.delete(callId);

          // Emit error to frontend before rejecting promise
          this.onError({
            message: `Permission request timed out: ${callId}`,
            type: 'timeout',
            details: { callId },
          });

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

    // NOTE: Do not call respondElicitation here as it's already handled
    // by CodexEventHandler with the proper decision mapping.
    // This method is only for resolving internal permission resolvers.

    // Resume paused requests
    this.resumeRequests();
  }

  public respondElicitation(callId: string, decision: 'approved' | 'approved_for_session' | 'denied' | 'abort'): void {
    // Accept uniqueId formats like 'patch_<id>' / 'elicitation_<id>' as well
    const normalized = callId.replace(/^patch_/, '').replace(/^elicitation_/, '');
    const reqId = this.elicitationMap.get(normalized) || this.elicitationMap.get(callId);
    if (reqId === undefined) {
      return;
    }
    const result = { decision };
    const response: JsonRpcResponse = { jsonrpc: JSONRPC_VERSION, id: reqId, result };
    const line = JSON.stringify(response) + '\n';

    this.child?.stdin?.write(line);

    // Clean up elicitationMap after responding
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
    // Create standardized error using error service
    const codexError = fromNetworkError(errorMsg, {
      source: 'CodexConnection',
      retryCount: this.retryCount,
    });

    // Process error through error service
    const processedError = globalErrorService.handleError(codexError);

    // Convert to legacy NetworkError format for backward compatibility
    // The userMessage now contains an i18n key that should be translated by the UI layer
    const networkError: NetworkError = {
      type: this.getNetworkErrorType(processedError.code),
      originalError: errorMsg,
      retryCount: this.retryCount,
      suggestedAction: processedError.userMessage || processedError.message,
    };

    // Decide whether to retry using error service logic
    if (globalErrorService.shouldRetry(processedError)) {
      this.scheduleRetry(pendingRequest, networkError);
    } else {
      // Max retries reached or unrecoverable error
      this.isNetworkError = true;

      // Emit error to frontend before rejecting promise
      this.onError({
        message: processedError.userMessage || processedError.message,
        type: 'network',
        details: {
          errorCode: processedError.code,
          retryCount: this.retryCount,
          originalError: errorMsg,
          networkErrorType: networkError.type,
        },
      });

      pendingRequest.reject(new Error(processedError.userMessage || processedError.message));
    }
  }

  private getNetworkErrorType(errorCode: string): NetworkError['type'] {
    switch (errorCode) {
      case 'CLOUDFLARE_BLOCKED':
        return 'cloudflare_blocked';
      case 'NETWORK_TIMEOUT':
        return 'network_timeout';
      case 'CONNECTION_REFUSED':
        return 'connection_refused';
      default:
        return 'unknown';
    }
  }

  private scheduleRetry(pendingRequest: PendingReq, networkError: NetworkError): void {
    this.retryCount++;

    setTimeout(() => {
      // For now, still reject since we can't easily replay the original request
      // In a more sophisticated implementation, you'd store and replay the original request

      // Emit error to frontend before rejecting promise
      this.onError({
        message: `Network error after ${this.retryCount} retries: ${networkError.type}`,
        type: 'network',
        details: {
          retryCount: this.retryCount,
          networkErrorType: networkError.type,
          originalError: networkError.originalError,
          isRetryFailure: true,
        },
      });

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

  // Public method to get connection diagnostics
  public getDiagnostics(): {
    isConnected: boolean;
    childProcess: boolean;
    pendingRequests: number;
    elicitationCount: number;
    isPaused: boolean;
    retryCount: number;
    hasNetworkError: boolean;
  } {
    return {
      isConnected: this.child !== null && !this.child.killed,
      childProcess: !!this.child,
      pendingRequests: this.pending.size,
      elicitationCount: this.elicitationMap.size,
      isPaused: this.isPaused,
      retryCount: this.retryCount,
      hasNetworkError: this.isNetworkError,
    };
  }

  // Simple ping test to check if connection is responsive
  public ping(timeout: number = 5000): Promise<boolean> {
    return this.request('ping', {}, timeout)
      .then(() => true)
      .catch(() => false);
  }

  // Wait for MCP server to be ready after startup
  public waitForServerReady(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkReady = () => {
        // Try to ping the server
        this.ping(3000)
          .then((isReady) => {
            if (isReady) {
              resolve();
              return;
            }

            // Check timeout
            if (Date.now() - startTime > timeout) {
              // Emit error to frontend before rejecting promise
              this.onError({
                message: `Timeout waiting for MCP server to be ready (${timeout}ms)`,
                type: 'timeout',
                details: { timeout },
              });

              reject(new Error('Timeout waiting for MCP server to be ready'));
              return;
            }

            // Wait and retry
            setTimeout(checkReady, 2000);
          })
          .catch(() => {
            // Ping failed, continue waiting
            if (Date.now() - startTime > timeout) {
              this.onError({
                message: `Timeout waiting for MCP server to be ready (${timeout}ms)`,
                type: 'timeout',
                details: { timeout },
              });

              reject(new Error('Timeout waiting for MCP server to be ready'));
              return;
            }

            setTimeout(checkReady, 2000);
          });
      };

      // Start checking after a short delay
      setTimeout(checkReady, 3000);
    });
  }

  // Handle process exit
  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    // Emit error to frontend about process exit
    this.onError({
      message: `Codex process exited unexpectedly (code: ${code}, signal: ${signal})`,
      type: 'process',
      details: { exitCode: code, signal },
    });

    // Reject all pending requests
    for (const [id, p] of this.pending) {
      p.reject(new Error(`Codex process exited with code ${code}, signal ${signal}`));
      if (p.timeout) clearTimeout(p.timeout);
      this.pending.delete(id);
    }

    // Clear state
    this.elicitationMap.clear();
    this.child = null;
  }
}
