/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AcpAgentCapabilities,
  AcpBackend,
  AcpIncomingMessage,
  AcpInitializeResult,
  AcpMessage,
  AcpNotification,
  AcpPermissionRequest,
  AcpPromptResponseUsage,
  AcpRequest,
  AcpResponse,
  AcpSessionConfigOption,
  AcpSessionModes,
  AcpSessionModels,
  AcpSessionUpdate,
} from '@/common/types/acpTypes';
import { ACP_METHODS, JSONRPC_VERSION, parseInitializeResult } from '@/common/types/acpTypes';
import type { ChildProcess } from 'child_process';
import type { AcpSessionMcpServer } from './mcpSessionConfig';
import path from 'path';
import { connectClaude, connectCodebuddy, connectCodex, spawnGenericBackend } from './acpConnectors';
import type { SpawnResult } from './acpConnectors';
import { killChild, readTextFile, writeJsonRpcMessage, writeTextFile } from './utils';

// Re-export for unit tests that import from this module
export { createGenericSpawnConfig } from './acpConnectors';

/**
 * Build a user-friendly error message for ACP startup failures.
 * Detects known error patterns (CLI not found, config errors) and
 * provides actionable guidance instead of raw stderr.
 *
 * Exported for unit testing.
 */
export function buildStartupErrorMessage(
  backend: string,
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrCombined: string,
  spawnErrorMessage: string | undefined,
  resolvedBackend: string | null
): string {
  let errMsg: string;
  if (stderrCombined) {
    errMsg = `${backend} ACP process exited during startup (code: ${code}):\n${stderrCombined}`;
  } else if (code === 0) {
    // Exit code 0 with no stderr strongly suggests the CLI version does not support ACP mode
    errMsg =
      `${backend} ACP process exited during startup (code: 0). ` +
      `This usually means the installed ${backend} CLI version does not support ACP mode. ` +
      `Please upgrade to a newer version that supports ACP.`;
  } else {
    errMsg = `${backend} ACP process exited during startup (code: ${code}, signal: ${signal})`;
  }

  // Detect "command not found" patterns across platforms and provide a clear hint
  if (
    code !== 0 &&
    /not recognized|not found|No such file|command not found|ENOENT/i.test(stderrCombined + (spawnErrorMessage ?? ''))
  ) {
    const cliHint = resolvedBackend ?? backend;
    errMsg = `'${cliHint}' CLI not found. Please install it or update the CLI path in Settings.\n${stderrCombined}`;
  }

  // Detect CLI config loading errors and provide actionable guidance.
  // e.g. Codex multi-agent config in config.toml that codex-acp cannot parse.
  if (code !== 0 && /error loading config/i.test(stderrCombined)) {
    const configPathMatch = stderrCombined.match(/error loading config:\s*([^\s:]+)/i);
    const configHint = configPathMatch?.[1] ?? 'the CLI config file';
    errMsg =
      `${backend} CLI failed to start due to a config file error. ` +
      `Please review or temporarily rename ${configHint} and try again.\n${stderrCombined}`;
  }

  return errMsg;
}

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
  method: string;
  isPaused: boolean;
  startTime: number;
  timeoutDuration: number;
}

export class AcpConnection {
  private child: ChildProcess | null = null;
  private pendingRequests = new Map<number, PendingRequest<unknown>>();
  private nextRequestId = 0;
  private sessionId: string | null = null;
  private isInitialized = false;
  private backend: AcpBackend | null = null;
  private initializeResult: AcpInitializeResult | null = null;
  private workingDir: string = process.cwd();

  // Cached session capabilities from session/new response
  private configOptions: AcpSessionConfigOption[] | null = null;
  private models: AcpSessionModels | null = null;
  private modes: AcpSessionModes | null = null;

  // Configurable prompt timeout in milliseconds (default: 300000 = 5 minutes)
  private promptTimeoutMs: number = 300000;

  // Performance tracking: timestamp when last prompt was sent
  private lastPromptSentAt: number = 0;
  private firstChunkReceived: boolean = true;

  public onSessionUpdate: (data: AcpSessionUpdate) => void = () => {};
  public onPermissionRequest: (data: AcpPermissionRequest) => Promise<{
    optionId: string;
  }> = () => Promise.resolve({ optionId: 'allow' }); // Returns a resolved Promise for interface consistency
  public onEndTurn: () => void = () => {}; // Handler for end_turn messages
  public onPromptUsage: (usage: AcpPromptResponseUsage) => void = () => {}; // Handler for PromptResponse.usage (per-turn token data)
  public onFileOperation: (operation: { method: string; path: string; content?: string; sessionId: string }) => void =
    () => {};

  /**
   * Set the prompt timeout duration in seconds.
   * @param seconds - Timeout in seconds (minimum 30, default 300)
   */
  setPromptTimeout(seconds: number): void {
    this.promptTimeoutMs = Math.max(30, seconds) * 1000;
  }

  // Disconnect callback - called when child process exits unexpectedly during runtime
  public onDisconnect: (error: { code: number | null; signal: NodeJS.Signals | null }) => void = () => {};

  // Track if initial setup is complete (to distinguish startup errors from runtime exits)
  private isSetupComplete = false;

  // Track if child process was spawned with detached: true (needs process group kill)
  private isDetached = false;

  /**
   * Kill the current child process (if any) and clear process-related state.
   * Used by both disconnect() and retry paths. Does NOT reset session-level
   * state (sessionId, backend, etc.) — that is disconnect()'s responsibility.
   */
  private async terminateChild(): Promise<void> {
    if (!this.child) {
      this.isDetached = false;
      return;
    }

    await killChild(this.child, this.isDetached);
    this.child = null;
    this.isDetached = false;
  }

  /**
   * Assign a spawned child process and set up ACP protocol handlers.
   * Shared by all connectors (npx-based and generic).
   */
  private async spawnAndSetup(result: SpawnResult, backend: string): Promise<void> {
    this.child = result.child;
    this.isDetached = result.isDetached;
    await this.setupChildProcessHandlers(backend);
  }

  // 通用的后端连接方法
  private async connectGenericBackend(
    backend: Exclude<AcpBackend, 'claude' | 'codebuddy' | 'codex'>,
    cliPath: string,
    workingDir: string,
    acpArgs?: string[],
    customEnv?: Record<string, string>
  ): Promise<void> {
    const result = await spawnGenericBackend(backend, cliPath, workingDir, acpArgs, customEnv);
    await this.spawnAndSetup(result, backend);
  }

  async connect(
    backend: AcpBackend,
    cliPath?: string,
    workingDir: string = process.cwd(),
    acpArgs?: string[],
    customEnv?: Record<string, string>
  ): Promise<void> {
    const connectStart = Date.now();
    console.log(`[ACP-PERF] connect: start backend=${backend}`);

    await this.doConnect(backend, cliPath, workingDir, acpArgs, customEnv);

    console.log(`[ACP-PERF] connect: total ${Date.now() - connectStart}ms`);
  }

  private async doConnect(
    backend: AcpBackend,
    cliPath?: string,
    workingDir: string = process.cwd(),
    acpArgs?: string[],
    customEnv?: Record<string, string>
  ): Promise<void> {
    if (this.child) {
      await this.disconnect();
    }

    this.backend = backend;
    if (workingDir) {
      this.workingDir = workingDir;
    }

    // Shared hooks for npx backends: wire spawned child into this connection
    const npxHooks = {
      setup: async (result: SpawnResult) => {
        await this.spawnAndSetup(result, backend);
      },
      cleanup: async () => {
        await this.terminateChild();
        this.isSetupComplete = false;
      },
    };

    switch (backend) {
      case 'claude':
        await connectClaude(workingDir, npxHooks);
        break;

      case 'codebuddy':
        await connectCodebuddy(workingDir, npxHooks);
        break;

      case 'codex':
        await connectCodex(workingDir, npxHooks);
        break;

      case 'qwen':
      case 'droid':
      case 'goose':
      case 'auggie':
      case 'kimi':
      case 'opencode':
      case 'copilot':
      case 'qoder':
      case 'vibe':
      case 'cursor':
      case 'kiro':
      case 'hermes':
      case 'snow':
        if (!cliPath) {
          throw new Error(`CLI path is required for ${backend} backend`);
        }
        await this.connectGenericBackend(backend, cliPath, workingDir, acpArgs, customEnv);
        break;

      case 'custom':
        if (!cliPath) {
          throw new Error('Custom agent CLI path/command is required');
        }
        await this.connectGenericBackend('custom', cliPath, workingDir, acpArgs, customEnv);
        break;

      default:
        throw new Error(`Unsupported backend: ${backend}`);
    }
  }

  private async setupChildProcessHandlers(backend: string): Promise<void> {
    // Capture non-null reference; fail fast if child process is not initialized
    const child = this.child;
    if (!child) {
      throw new Error(`[ACP ${backend}] Child process not initialized`);
    }

    let spawnError: Error | null = null;

    // Collect stderr output for diagnostics on early crash.
    // Keep both head and tail so we capture the actual error message even when
    // minified source code lines fill up the middle (Node.js prints the
    // offending source line before the error type/message).
    const STDERR_HEAD_MAX = 512;
    const STDERR_TAIL_MAX = 1536;
    let stderrHead = '';
    let stderrTail = '';
    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      console.error(`[ACP ${backend} STDERR]:`, chunk);
      if (stderrHead.length < STDERR_HEAD_MAX) {
        stderrHead += chunk;
        if (stderrHead.length > STDERR_HEAD_MAX) {
          stderrHead = stderrHead.slice(0, STDERR_HEAD_MAX);
        }
      }
      // Always keep the latest tail content so the error message is preserved
      stderrTail += chunk;
      if (stderrTail.length > STDERR_TAIL_MAX) {
        stderrTail = stderrTail.slice(-STDERR_TAIL_MAX);
      }
    });

    child.on('error', (error) => {
      // Provide a friendlier message when the CLI binary is not found (ENOENT)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const cliHint = this.backend ?? backend;
        spawnError = new Error(`'${cliHint}' CLI not found. Please install it or update the CLI path in Settings.`);
      } else {
        spawnError = error;
      }
    });

    // Promise that rejects when the child process exits during setup.
    // Used in Promise.race to detect early crashes without waiting for the 60s timeout.
    let processExitReject: ((err: Error) => void) | null = null;
    const processExitPromise = new Promise<never>((_resolve, reject) => {
      processExitReject = reject;
    });
    // Eagerly attach a no-op rejection handler so that if the process fails
    // before we reach Promise.race (e.g. ENOENT from a missing CLI binary),
    // the rejection does not become an unhandled promise rejection.
    processExitPromise.catch(() => {});

    // Exit handler for both startup and runtime phases
    child.on('exit', (code, signal) => {
      console.error(`[ACP ${backend}] Process exited with code: ${code}, signal: ${signal}`);

      if (!this.isSetupComplete) {
        // Startup phase - set error for initial check.
        // Include stderr in spawnError so callers can detect specific failures
        // (e.g., npm "notarget" for stale cache recovery).
        // Combine head + tail, deduplicating any overlap
        const stderrCombined =
          stderrHead + (stderrTail && !stderrHead.endsWith(stderrTail) ? '\n…\n' + stderrTail : '');
        const errMsg = buildStartupErrorMessage(
          backend,
          code,
          signal,
          stderrCombined,
          spawnError?.message,
          this.backend
        );
        if (code !== 0 && !spawnError) {
          spawnError = new Error(errMsg);
        }
        // Reject processExitPromise so Promise.race returns immediately
        processExitReject?.(new Error(errMsg));
      } else {
        // Runtime phase - handle unexpected exit
        this.handleProcessExit(code, signal);
      }
    });

    // Yield to event loop so spawn error/exit events can fire
    await new Promise((resolve) => setImmediate(resolve));

    // Check if process spawn failed
    if (spawnError) {
      throw spawnError;
    }

    // Check if process is still running
    if (child.killed) {
      throw new Error(`${backend} ACP process failed to start or exited immediately`);
    }

    // Handle messages from ACP server
    let buffer = '';
    child.stdout?.on('data', (data: Buffer) => {
      const dataStr = data.toString();
      buffer += dataStr;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const handleStart = Date.now();
            const message = JSON.parse(line) as AcpMessage;
            this.handleMessage(message);
            const handleDuration = Date.now() - handleStart;
            if (handleDuration > 5) {
              console.log(
                `[ACP-PERF] stream: handleMessage ${handleDuration}ms method=${
                  'method' in message ? (message as AcpIncomingMessage).method : 'response'
                }`
              );
            }
          } catch (error) {
            // Ignore parsing errors for non-JSON messages
          }
        }
      }
    });

    // Initialize protocol with timeout, also racing against early process exit
    const initStart = Date.now();
    try {
      await Promise.race([
        this.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error('Initialize timeout after 60 seconds'));
          }, 60000)
        ),
        processExitPromise,
      ]);
    } finally {
      // Neutralize processExitReject so later exits won't call a stale reject.
      processExitReject = null;
    }
    console.log(`[ACP-PERF] connect: protocol initialized ${Date.now() - initStart}ms`);

    // Mark setup as complete - future exits will be handled as runtime disconnects
    this.isSetupComplete = true;
  }

  /**
   * Handle unexpected process exit during runtime
   * Similar to Codex's handleProcessExit implementation
   */
  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    // 1. Reject all pending requests with clear error message
    for (const [_id, request] of this.pendingRequests) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error(`ACP process exited unexpectedly (code: ${code}, signal: ${signal})`));
    }
    this.pendingRequests.clear();

    // 2. Clear connection state
    this.sessionId = null;
    this.isInitialized = false;
    this.isSetupComplete = false;
    this.isDetached = false;
    this.backend = null;
    this.initializeResult = null;
    this.configOptions = null;
    this.models = null;
    this.modes = null;
    this.child = null;

    // 3. Notify AcpAgent about disconnect
    this.onDisconnect({ code, signal });
  }

  private sendRequest<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextRequestId++;
    const message: AcpRequest = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      ...(params && { params }),
    };

    return new Promise((resolve, reject) => {
      // Use longer timeout for session/prompt requests as they involve LLM processing
      // Complex tasks like document processing may need significantly more time
      const timeoutDuration = method === 'session/prompt' ? this.promptTimeoutMs : 60000;
      const startTime = Date.now();

      const initialTimeout = setTimeout(() => {
        const request = this.pendingRequests.get(id);
        if (request && !request.isPaused) {
          this.handlePromptTimeout(id, request);
        }
      }, timeoutDuration);

      const pendingRequest: PendingRequest<T> = {
        resolve: (value: T) => {
          if (pendingRequest.timeoutId) {
            clearTimeout(pendingRequest.timeoutId);
          }
          resolve(value);
        },
        reject: (error: Error) => {
          if (pendingRequest.timeoutId) {
            clearTimeout(pendingRequest.timeoutId);
          }
          reject(error);
        },
        timeoutId: initialTimeout,
        method,
        isPaused: false,
        startTime,
        timeoutDuration,
      };

      this.pendingRequests.set(id, pendingRequest);

      this.sendMessage(message);
    });
  }

  /**
   * Handle request timeout: for session/prompt, send session/cancel to stop
   * LLM generation without killing the process; for other methods, just reject.
   */
  private handlePromptTimeout(requestId: number, request: PendingRequest<unknown>): void {
    this.pendingRequests.delete(requestId);
    if (request.method === 'session/prompt') {
      this.cancelPrompt();
    }
    request.reject(
      new Error(
        request.method === 'session/prompt'
          ? `LLM request timed out after ${request.timeoutDuration / 1000} seconds`
          : `Request ${request.method} timed out after ${request.timeoutDuration / 1000} seconds`
      )
    );
  }

  // 暂停指定请求的超时计时器
  private pauseRequestTimeout(requestId: number): void {
    const request = this.pendingRequests.get(requestId);
    if (request && !request.isPaused && request.timeoutId) {
      clearTimeout(request.timeoutId);
      request.isPaused = true;
      request.timeoutId = undefined;
    }
  }

  // 恢复指定请求的超时计时器
  // Reset startTime so the full timeout budget restarts after a permission pause.
  // Without this, long permission waits cause immediate timeout on resume.
  private resumeRequestTimeout(requestId: number): void {
    const request = this.pendingRequests.get(requestId);
    if (request && request.isPaused) {
      request.startTime = Date.now();
      request.timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId) && !request.isPaused) {
          this.handlePromptTimeout(requestId, request);
        }
      }, request.timeoutDuration);
      request.isPaused = false;
    }
  }

  // 暂停所有 session/prompt 请求的超时
  private pauseSessionPromptTimeouts(): void {
    let _pausedCount = 0;
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt') {
        this.pauseRequestTimeout(id);
        _pausedCount++;
      }
    }
  }

  // 恢复所有 session/prompt 请求的超时
  private resumeSessionPromptTimeouts(): void {
    let _resumedCount = 0;
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt' && request.isPaused) {
        this.resumeRequestTimeout(id);
        _resumedCount++;
      }
    }
  }

  // 重置所有 session/prompt 请求的超时计时器（在收到流式更新时调用）
  // Reset timeout timers for all session/prompt requests (called when receiving streaming updates)
  private resetSessionPromptTimeouts(): void {
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt' && !request.isPaused && request.timeoutId) {
        // Clear existing timeout
        clearTimeout(request.timeoutId);
        // Reset start time and create new timeout
        request.startTime = Date.now();
        request.timeoutId = setTimeout(() => {
          if (this.pendingRequests.has(id) && !request.isPaused) {
            this.handlePromptTimeout(id, request);
          }
        }, request.timeoutDuration);
      }
    }
  }

  private sendMessage(message: AcpRequest | AcpNotification): void {
    if (this.child) {
      writeJsonRpcMessage(this.child, message);
    }
  }

  private sendResponseMessage(response: AcpResponse): void {
    if (this.child) {
      writeJsonRpcMessage(this.child, response);
    }
  }

  private handleMessage(message: AcpMessage): void {
    try {
      // 优先检查是否为 request/notification（有 method 字段）
      if ('method' in message) {
        // 直接传递给 handleIncomingRequest，switch 会过滤未知 method
        this.handleIncomingRequest(message as AcpIncomingMessage).catch((_error) => {
          // Handle request errors silently
        });
      } else if ('id' in message && typeof message.id === 'number' && this.pendingRequests.has(message.id)) {
        // This is a response to a previous request
        const { resolve, reject } = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if ('result' in message) {
          // Check for end_turn message and extract usage data
          if (message.result && typeof message.result === 'object') {
            const promptResult = message.result as Record<string, unknown>;
            if (promptResult.stopReason === 'end_turn') {
              this.onEndTurn();
            }
            // Extract PromptResponse.usage (per-turn token data from codex-acp / PR #167)
            if (promptResult.usage && typeof promptResult.usage === 'object') {
              const usage = promptResult.usage as AcpPromptResponseUsage;
              if (typeof usage.totalTokens === 'number') {
                this.onPromptUsage(usage);
              }
            }
          }
          resolve(message.result);
        } else if ('error' in message) {
          const errorMsg = message.error?.message || 'Unknown ACP error';
          reject(new Error(errorMsg));
        }
      } else {
        // Unknown message format, ignore
      }
    } catch (_error) {
      // Handle message parsing errors silently
    }
  }

  private async handleIncomingRequest(message: AcpIncomingMessage): Promise<void> {
    try {
      let result = null;

      // 可辨识联合类型：TypeScript 根据 method 字面量自动窄化 params 类型
      switch (message.method) {
        case ACP_METHODS.SESSION_UPDATE:
          // Track first chunk latency since prompt was sent
          if (!this.firstChunkReceived && this.lastPromptSentAt > 0) {
            this.firstChunkReceived = true;
            console.log(
              `[ACP-PERF] stream: first chunk received ${Date.now() - this.lastPromptSentAt}ms (since prompt sent)`
            );
          }
          // Reset timeout on streaming updates - LLM is still processing
          this.resetSessionPromptTimeouts();
          // Update cached configOptions when config_option_update arrives
          if (
            message.params?.update &&
            (message.params.update as Record<string, unknown>).sessionUpdate === 'config_option_update'
          ) {
            const updatePayload = message.params.update as { configOptions?: AcpSessionConfigOption[] };
            if (Array.isArray(updatePayload.configOptions)) {
              this.configOptions = updatePayload.configOptions;
            }
          }
          this.onSessionUpdate(message.params);
          break;
        case ACP_METHODS.REQUEST_PERMISSION:
          result = await this.handlePermissionRequest(message.params);
          break;
        case ACP_METHODS.READ_TEXT_FILE:
          result = await this.handleReadOperation(message.params);
          break;
        case ACP_METHODS.WRITE_TEXT_FILE:
          result = await this.handleWriteOperation(message.params);
          break;
      }

      // If this is a request (has id), send response
      if ('id' in message && typeof message.id === 'number') {
        this.sendResponseMessage({
          jsonrpc: JSONRPC_VERSION,
          id: message.id,
          result,
        });
      }
    } catch (error) {
      if ('id' in message && typeof message.id === 'number') {
        this.sendResponseMessage({
          jsonrpc: JSONRPC_VERSION,
          id: message.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  private async handlePermissionRequest(params: AcpPermissionRequest): Promise<{
    outcome: { outcome: string; optionId: string };
  }> {
    // 暂停所有 session/prompt 请求的超时计时器
    this.pauseSessionPromptTimeouts();
    try {
      const response = await this.onPermissionRequest(params);

      // 根据用户的选择决定outcome
      const optionId = response.optionId;
      const outcome = optionId.includes('reject') ? 'rejected' : 'selected';

      return {
        outcome: {
          outcome,
          optionId: optionId,
        },
      };
    } catch (error) {
      // 处理超时或其他错误情况，默认拒绝
      console.error('Permission request failed:', error);
      return {
        outcome: {
          outcome: 'rejected',
          optionId: 'reject_once', // 默认拒绝
        },
      };
    } finally {
      // 无论成功还是失败，都恢复 session/prompt 请求的超时计时器
      this.resumeSessionPromptTimeouts();
    }
  }

  private resolveWorkspacePath(targetPath: string): string {
    // Absolute paths are used as-is; relative paths are anchored to the conversation workspace
    // 绝对路径保持不变， 相对路径锚定到当前会话的工作区
    if (!targetPath) return this.workingDir;
    if (path.isAbsolute(targetPath)) {
      return targetPath;
    }
    return path.join(this.workingDir, targetPath);
  }

  private async initialize(): Promise<AcpResponse> {
    const initializeParams = {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    };

    const response = await this.sendRequest<AcpResponse>('initialize', initializeParams);
    this.isInitialized = true;
    this.initializeResult = parseInitializeResult(response);
    // Some agents (e.g. qwen-code) advertise top-level modes in the initialize
    // response rather than in session/new. Seed this.modes here so consumers
    // (caching, UI selectors) don't have to wait for a second update.
    const initModes = (response as unknown as Record<string, unknown>).modes as AcpSessionModes | undefined;
    if (initModes?.availableModes && initModes.availableModes.length > 0) {
      this.modes = initModes;
    }
    return response;
  }

  async authenticate(methodId?: string): Promise<AcpResponse> {
    const result = await this.sendRequest<AcpResponse>('authenticate', methodId ? { methodId } : undefined);
    return result;
  }

  /**
   * Create a new session or resume an existing one.
   * 创建新会话或恢复现有会话。
   *
   * @param cwd - Working directory for the session
   * @param options - Optional resume parameters
   * @param options.resumeSessionId - Session ID to resume (if supported by backend)
   * @param options.forkSession - When true, creates a new session ID while preserving conversation context.
   *                              When false (default), reuses the original session ID.
   *                              为 true 时创建新 session ID 但保留对话上下文；为 false（默认）时复用原 session ID。
   */
  async newSession(
    cwd: string = process.cwd(),
    options?: { resumeSessionId?: string; forkSession?: boolean; mcpServers?: AcpSessionMcpServer[] }
  ): Promise<AcpResponse & { sessionId?: string }> {
    // Normalize workspace-relative paths:
    // Agents such as qwen already run with `workingDir` as their process cwd.
    // Sending the absolute path again makes some CLIs treat it as a nested relative path.
    const normalizedCwd = this.normalizeCwdForAgent(cwd);

    // Build _meta resume payload only when backend/capabilities indicate Claude-style resume.
    const caps = this.initializeResult?.capabilities;
    const useClaudeMetaResume = this.backend === 'claude' || !!caps?._meta?.claudeCode;
    const useMetaResume = useClaudeMetaResume && options?.resumeSessionId;
    const meta = useMetaResume
      ? {
          claudeCode: {
            options: {
              resume: options.resumeSessionId,
            },
          },
        }
      : undefined;

    const response = await this.sendRequest<AcpResponse & { sessionId?: string }>('session/new', {
      cwd: normalizedCwd,
      mcpServers: options?.mcpServers ?? [],
      // Claude-style ACP uses _meta for resume
      ...(meta && { _meta: meta }),
      // Generic resume parameters for other ACP backends
      ...(!meta && options?.resumeSessionId && { resumeSessionId: options.resumeSessionId }),
      ...(options?.forkSession && { forkSession: options.forkSession }),
    });

    this.sessionId = response.sessionId;

    this.parseSessionCapabilities(response);

    // console.log(`[ACP ${this.backend}] session/new response:`, JSON.stringify(response, null, 2));

    return response;
  }

  /**
   * Get the fully parsed initialize result.
   * Returns null before initialize() completes.
   */
  getInitializeResult(): AcpInitializeResult | null {
    return this.initializeResult;
  }

  /**
   * Get parsed agent capabilities from the initialize response.
   * Returns null before initialize() completes.
   */
  getAgentCapabilities(): AcpAgentCapabilities | null {
    return this.initializeResult?.capabilities ?? null;
  }

  async resumeSession(
    sessionId: string,
    cwd: string = process.cwd(),
    options?: { forkSession?: boolean; mcpServers?: AcpSessionMcpServer[] }
  ): Promise<AcpResponse & { sessionId?: string }> {
    const caps = this.initializeResult?.capabilities;
    const useClaudeMetaResume = this.backend === 'claude' || !!caps?._meta?.claudeCode;
    const supportsLoadSession = caps?.loadSession === true;
    const shouldTryLoadSession = !useClaudeMetaResume && supportsLoadSession;

    if (shouldTryLoadSession) {
      try {
        return await this.loadSession(sessionId, cwd, options?.mcpServers);
      } catch (loadError) {
        const loadErrorMsg = loadError instanceof Error ? loadError.message : String(loadError);
        console.warn(`[ACP ${this.backend}] session/load failed, falling back to session/new resume:`, loadErrorMsg);
      }
    }

    return await this.newSession(cwd, {
      resumeSessionId: sessionId,
      forkSession: options?.forkSession,
      mcpServers: options?.mcpServers,
    });
  }

  /**
   * Load/resume an existing session using the ACP session/load method.
   * Codex ACP bridge implements `load_session()` which internally calls
   * `resume_thread_from_rollout` to restore full conversation history from disk.
   *
   * @param sessionId - The session ID to load/resume
   * @param cwd - Working directory for the session
   */
  async loadSession(
    sessionId: string,
    cwd: string = process.cwd(),
    mcpServers?: AcpSessionMcpServer[]
  ): Promise<AcpResponse & { sessionId?: string }> {
    const normalizedCwd = this.normalizeCwdForAgent(cwd);

    const response = await this.sendRequest<AcpResponse & { sessionId?: string }>('session/load', {
      sessionId,
      cwd: normalizedCwd,
      mcpServers: (mcpServers ?? []) as unknown[],
    });

    // session/load returns modes/models/configOptions but not sessionId — keep the one we sent
    this.sessionId = response.sessionId || sessionId;

    this.parseSessionCapabilities(response);

    return response;
  }

  /**
   * Parse configOptions, models, and modes from a session response (session/new or session/load).
   */
  private parseSessionCapabilities(response: unknown): void {
    const result = response as Record<string, unknown>;
    if (Array.isArray(result.configOptions)) {
      this.configOptions = result.configOptions as AcpSessionConfigOption[];
    }

    // Parse top-level modes (used by qoder, opencode, etc.)
    const modesField = result.modes as AcpSessionModes | undefined;
    if (modesField?.availableModes && modesField.availableModes.length > 0) {
      this.modes = modesField;
    }

    // Check top-level models first, then fall back to _meta.models (some backends nest models under _meta)
    const modelsSource = result.models || (result._meta as Record<string, unknown> | undefined)?.models;
    if (modelsSource && typeof modelsSource === 'object') {
      this.models = modelsSource as AcpSessionModels;
    }
  }

  /**
   * Ensure the cwd we send to ACP agents is relative to the actual working directory.
   * 某些 CLI 会对绝对路径进行再次拼接，导致“套娃”路径，因此需要转换为相对路径。
   */
  private normalizeCwdForAgent(cwd?: string): string {
    const defaultPath = '.';
    if (!cwd) return defaultPath;

    // Some CLIs require absolute paths for cwd
    // - Copilot: "Directory path must be absolute: ."
    // - Codex (via codex-acp): "cwd is not absolute: ."
    if (this.backend === 'copilot' || this.backend === 'codex') {
      return path.resolve(cwd);
    }

    try {
      const workspaceRoot = path.resolve(this.workingDir);
      const requested = path.resolve(cwd);

      const relative = path.relative(workspaceRoot, requested);
      const isInsideWorkspace = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

      if (isInsideWorkspace) {
        return relative.length === 0 ? defaultPath : relative;
      }
    } catch (error) {
      console.warn('[ACP] Failed to normalize cwd for agent, using default "."', error);
    }

    return defaultPath;
  }

  async sendPrompt(prompt: string): Promise<AcpResponse> {
    if (!this.sessionId) {
      throw new Error('No active ACP session');
    }

    this.lastPromptSentAt = Date.now();
    this.firstChunkReceived = false;
    console.log(`[ACP-PERF] send: prompt sent to ${this.backend}`);

    return await this.sendRequest('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text: prompt }],
    });
  }

  /**
   * Cancel the current prompt turn by sending a session/cancel notification.
   * This tells the backend to stop LLM generation and tool calls ASAP.
   * Also clears all pending session/prompt requests locally.
   */
  cancelPrompt(): void {
    if (!this.sessionId) return;

    // Send ACP session/cancel notification (no response expected)
    this.sendMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'session/cancel',
      params: { sessionId: this.sessionId },
    });

    // Clear all pending session/prompt requests
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt') {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        this.pendingRequests.delete(id);
        request.resolve(null);
      }
    }
  }

  async setSessionMode(modeId: string): Promise<AcpResponse> {
    if (!this.sessionId) {
      throw new Error('No active ACP session');
    }

    const response = await this.sendRequest<AcpResponse>('session/set_mode', {
      sessionId: this.sessionId,
      modeId,
    });

    // Optimistically update the cached modes state
    if (this.modes) {
      this.modes = { ...this.modes, currentModeId: modeId };
    }

    return response;
  }

  async setModel(modelId: string): Promise<AcpResponse> {
    if (!this.sessionId) {
      throw new Error('No active ACP session');
    }

    const response = await this.sendRequest<AcpResponse>('session/set_model', {
      sessionId: this.sessionId,
      modelId,
    });

    // Update local models cache with the new model ID
    if (this.models) {
      this.models = { ...this.models, currentModelId: modelId };
    }

    // Also update configOptions cache so getModelInfo() returns consistent data.
    // The unstable_setSessionModel handler in claude-agent-acp will also send a
    // config_option_update notification, but we update eagerly for immediate reads.
    if (this.configOptions) {
      this.configOptions = this.configOptions.map((opt) =>
        opt.category === 'model' ? { ...opt, currentValue: modelId, selectedValue: modelId } : opt
      );
    }

    return response;
  }

  async setConfigOption(configId: string, value: string): Promise<AcpResponse> {
    if (!this.sessionId) {
      throw new Error('No active ACP session');
    }

    const response = await this.sendRequest<AcpResponse>(ACP_METHODS.SET_CONFIG_OPTION, {
      sessionId: this.sessionId,
      configId,
      value,
    });

    // The response may contain the updated configOptions
    const result = response as unknown as Record<string, unknown>;
    if (Array.isArray(result.configOptions)) {
      this.configOptions = result.configOptions as AcpSessionConfigOption[];
    } else if (this.configOptions) {
      // Optimistically update the cached currentValue so getModelInfo() reflects
      // the switch immediately, even if the agent responds without configOptions.
      // A subsequent config_option_update notification will overwrite this if needed.
      this.configOptions = this.configOptions.map((opt) =>
        opt.id === configId ? { ...opt, currentValue: value, selectedValue: value } : opt
      );
    }

    return response;
  }

  getConfigOptions(): AcpSessionConfigOption[] | null {
    return this.configOptions;
  }

  getModels(): AcpSessionModels | null {
    return this.models;
  }

  getModes(): AcpSessionModes | null {
    return this.modes;
  }

  async disconnect(): Promise<void> {
    // Try graceful session/close only when the agent declared support.
    // session/close is an ACP RFD — sending it to unsupported agents wastes
    // time and may trigger "method not found" errors in their logs.
    if (
      this.sessionId &&
      this.child &&
      !this.child.killed &&
      this.initializeResult?.capabilities.sessionCapabilities.close
    ) {
      try {
        await Promise.race([
          this.sendRequest('session/close', { sessionId: this.sessionId }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('session/close timeout')), 2000)),
        ]);
      } catch {
        // Best-effort: agent may not respond in time
      }
    }

    // Mark setup as incomplete BEFORE killing the child process.
    // killChild() waits for the process to exit, and the exit event fires
    // during that wait. If isSetupComplete is still true at that point,
    // the exit handler calls handleProcessExit → onDisconnect → emits
    // agentCrash:true, causing TeammateManager to treat a controlled
    // shutdown as an unexpected crash (and remove the agent from the team).
    this.isSetupComplete = false;

    await this.terminateChild();

    // Reset session-level state
    this.pendingRequests.clear();
    this.sessionId = null;
    this.isInitialized = false;
    this.backend = null;
    this.initializeResult = null;
    this.configOptions = null;
    this.models = null;
    this.modes = null;
  }

  get isConnected(): boolean {
    const connected = this.child !== null && !this.child.killed;
    return connected;
  }

  get hasActiveSession(): boolean {
    const hasSession = this.sessionId !== null;
    return hasSession;
  }

  /**
   * Get the current session ID (for session resume support).
   * 获取当前 session ID（用于会话恢复支持）。
   */
  get currentSessionId(): string | null {
    return this.sessionId;
  }

  get currentBackend(): AcpBackend | null {
    return this.backend;
  }

  /**
   * @deprecated Use getInitializeResult() or getAgentCapabilities() instead.
   * Returns the raw initialize response for backward compatibility.
   */
  getInitializeResponse(): AcpResponse | null {
    // Return null — callers should migrate to getInitializeResult()
    return null;
  }

  // Normalize read operations to the conversation workspace before touching the filesystem
  // 访问文件前先把读取操作映射到会话工作区
  private async handleReadOperation(params: { path: string; sessionId?: string }): Promise<{ content: string }> {
    const resolvedReadPath = this.resolveWorkspacePath(params.path);
    this.onFileOperation({
      method: 'fs/read_text_file',
      path: resolvedReadPath,
      sessionId: params.sessionId || '',
    });
    return await readTextFile(resolvedReadPath);
  }

  // Normalize write operations and emit UI events so the workspace view stays in sync
  // 将写入操作归一化并通知 UI，保持工作区视图同步
  private async handleWriteOperation(params: { path: string; content: string; sessionId?: string }): Promise<null> {
    const resolvedWritePath = this.resolveWorkspacePath(params.path);
    this.onFileOperation({
      method: 'fs/write_text_file',
      path: resolvedWritePath,
      content: params.content,
      sessionId: params.sessionId || '',
    });
    return await writeTextFile(resolvedWritePath, params.content);
  }
}
