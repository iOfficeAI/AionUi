/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AcpBackend,
  AcpIncomingMessage,
  AcpMessage,
  AcpNotification,
  AcpPermissionRequest,
  AcpPromptResponseUsage,
  AcpRequest,
  AcpResponse,
  AcpSessionConfigOption,
  AcpSessionModels,
  AcpSessionUpdate,
} from '@/common/types/acpTypes';
import { ACP_METHODS, JSONRPC_VERSION } from '@/common/types/acpTypes';
import type { ChildProcess } from 'child_process';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { buildAcpModelInfo, summarizeAcpModelInfo } from './modelInfo';
import type { AcpSessionMcpServer } from './mcpSessionConfig';
import { mainLog } from '@process/utils/mainLogger';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { getNpxCacheDir, getWindowsShellExecutionOptions, resolveNpxPath } from '@process/utils/shellEnv';
import {
  ACP_PERF_LOG,
  connectClaude,
  connectCodebuddy,
  connectCodex,
  prepareCleanEnv,
  spawnGenericBackend,
} from './acpConnectors';
import type { SpawnResult } from './acpConnectors';
import { killChild, readTextFile, writeJsonRpcMessage, writeTextFile } from './utils';

const execFile = promisify(execFileCb);

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
  // Wall-clock timestamp of when this request was first created; never updated.
  // Used by the keepalive to cap how long it will keep resetting the timeout.
  promptOriginTime: number;
}

export class AcpConnection {
  private child: ChildProcess | null = null;
  private pendingRequests = new Map<number, PendingRequest<unknown>>();
  private nextRequestId = 0;
  private sessionId: string | null = null;
  private isInitialized = false;
  private backend: AcpBackend | null = null;
  private initializeResponse: AcpResponse | null = null;
  private workingDir: string = process.cwd();

  // Cached model information from session/new response
  private configOptions: AcpSessionConfigOption[] | null = null;
  private models: AcpSessionModels | null = null;

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

  // Periodic keepalive: while a session/prompt is pending, check that the child
  // process is still alive and reset the timeout timer accordingly.  This prevents
  // false timeouts when an ACP agent is executing a long-running tool that produces
  // no streaming output (e.g. a multi-minute build or test suite).
  private promptKeepaliveInterval: NodeJS.Timeout | null = null;
  private static readonly KEEPALIVE_INTERVAL_MS = 60_000; // check every 60 s

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

  /** Npx-based backends that may need npm cache recovery on version mismatch */
  private static readonly NPX_BACKENDS: ReadonlySet<string> = new Set(['claude', 'codex', 'codebuddy']);

  async connect(
    backend: AcpBackend,
    cliPath?: string,
    workingDir: string = process.cwd(),
    acpArgs?: string[],
    customEnv?: Record<string, string>
  ): Promise<void> {
    const connectStart = Date.now();
    if (ACP_PERF_LOG) console.log(`[ACP-PERF] connect: start backend=${backend}`);

    try {
      await this.doConnect(backend, cliPath, workingDir, acpArgs, customEnv);
    } catch (error) {
      // For npx-based backends, detect stale npm cache errors and auto-recover.
      // When we upgrade a bridge package version (e.g., claude-agent-acp 0.17→0.18),
      // users with the old version cached hit "notarget" because --prefer-offline
      // serves stale metadata. Cleaning the cache and retrying fixes this.
      const errMsg = error instanceof Error ? error.message : String(error);
      if (AcpConnection.NPX_BACKENDS.has(backend) && /notarget|no matching version/i.test(errMsg)) {
        console.warn(`[ACP] Detected stale npm cache for ${backend}, cleaning and retrying...`);
        try {
          const cleanEnv = prepareCleanEnv();
          const npmPath = resolveNpxPath(cleanEnv)
            .replace(/npx$/, 'npm')
            .replace(/npx\.cmd$/, 'npm.cmd');
          await execFile(npmPath, ['cache', 'clean', '--force'], {
            env: cleanEnv,
            timeout: 30000,
            ...getWindowsShellExecutionOptions(),
          });
          console.warn('[ACP] npm cache cleaned, retrying connection...');
        } catch (cleanError) {
          console.warn('[ACP] Failed to clean npm cache:', cleanError);
          throw error; // Throw original error if cache clean fails
        }
        await this.doConnect(backend, cliPath, workingDir, acpArgs, customEnv);
      } else if (
        AcpConnection.NPX_BACKENDS.has(backend) &&
        errMsg.includes('_npx') &&
        /ENOENT|ERR_MODULE_NOT_FOUND|Cannot find package/i.test(errMsg)
      ) {
        // Corrupted npx cache: the _npx/<hash> directory exists but has missing
        // or incomplete files (e.g. package.json deleted, transitive deps like zod
        // not installed). Phase 1/2 retries don't help because npx reuses the
        // existing directory. Fix: delete the _npx cache and retry from scratch.
        console.warn(`[ACP] Detected corrupted npx cache for ${backend}, cleaning _npx and retrying...`);
        try {
          const npxCacheDir = getNpxCacheDir();
          await fs.rm(npxCacheDir, { recursive: true, force: true });
          console.warn(`[ACP] Cleaned corrupted npx cache: ${npxCacheDir}`);
        } catch (cleanError) {
          console.warn('[ACP] Failed to clean npx cache:', cleanError);
          throw error;
        }
        await this.doConnect(backend, cliPath, workingDir, acpArgs, customEnv);
      } else {
        throw error;
      }
    }

    if (ACP_PERF_LOG) console.log(`[ACP-PERF] connect: total ${Date.now() - connectStart}ms`);
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

      case 'gemini':
      case 'qwen':
      case 'iflow':
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
            const handleStart = ACP_PERF_LOG ? Date.now() : 0;
            const message = JSON.parse(line) as AcpMessage;
            this.handleMessage(message);
            if (ACP_PERF_LOG) {
              const handleDuration = Date.now() - handleStart;
              if (handleDuration > 5) {
                console.log(
                  `[ACP-PERF] stream: handleMessage ${handleDuration}ms method=${'method' in message ? (message as AcpIncomingMessage).method : 'response'}`
                );
              }
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
      // Attach .catch only now — prevents unhandled rejection if the process exits
      // after setup completed (or after another racer won).
      processExitReject = null;
      processExitPromise.catch(() => {});
    }
    if (ACP_PERF_LOG) console.log(`[ACP-PERF] connect: protocol initialized ${Date.now() - initStart}ms`);

    // Mark setup as complete - future exits will be handled as runtime disconnects
    this.isSetupComplete = true;
  }

  /**
   * Handle unexpected process exit during runtime
   * Similar to Codex's handleProcessExit implementation
   */
  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.stopPromptKeepalive();
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
    this.initializeResponse = null;
    this.configOptions = null;
    this.models = null;
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
        promptOriginTime: startTime,
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
      request.promptOriginTime = Date.now();
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

  /**
   * Returns true only if the child process is confirmed to still be running.
   * Checks exitCode and signalCode in addition to killed, because killed is
   * only set when the process is terminated via Node's .kill() — a naturally
   * crashing child leaves killed=false until the exit event is processed.
   * exitCode/signalCode are set by the runtime as soon as the process exits,
   * so they reliably detect a dead child even before the exit event fires.
   */
  private isChildAlive(): boolean {
    return this.child !== null && !this.child.killed && this.child.exitCode === null && this.child.signalCode === null;
  }

  /**
   * Start a periodic keepalive that resets prompt timeout timers as long as
   * the child process is still alive.  This complements the streaming-based
   * reset in resetSessionPromptTimeouts(): when the agent is executing a
   * silent tool (no session.update emitted), the keepalive prevents a false
   * timeout while the process-exit handler covers the case where the child
   * actually crashes.
   */
  private startPromptKeepalive(): void {
    this.stopPromptKeepalive();
    this.promptKeepaliveInterval = setInterval(() => {
      if (!this.isChildAlive()) return;
      // Only reset timeouts for requests that are still within their original
      // wall-clock budget (promptOriginTime + timeoutDuration). This prevents
      // a hung process from being kept alive indefinitely by the keepalive.
      const now = Date.now();
      const hasEligibleRequest = [...this.pendingRequests.values()].some(
        (r) => r.method === 'session/prompt' && now - r.promptOriginTime < r.timeoutDuration
      );
      if (hasEligibleRequest) {
        this.resetSessionPromptTimeouts();
      }
    }, AcpConnection.KEEPALIVE_INTERVAL_MS);
  }

  private stopPromptKeepalive(): void {
    if (this.promptKeepaliveInterval) {
      clearInterval(this.promptKeepaliveInterval);
      this.promptKeepaliveInterval = null;
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
            if (ACP_PERF_LOG)
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
    this.initializeResponse = response;
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

    // Build _meta for Claude/CodeBuddy ACP resume support
    // claude-agent-acp and codebuddy use _meta.claudeCode.options.resume for session resume
    const useMetaResume = (this.backend === 'claude' || this.backend === 'codebuddy') && options?.resumeSessionId;
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
      // Claude/CodeBuddy ACP uses _meta for resume
      ...(meta && { _meta: meta }),
      // Generic resume parameters for other ACP backends
      ...(this.backend !== 'claude' &&
        this.backend !== 'codebuddy' &&
        options?.resumeSessionId && { resumeSessionId: options.resumeSessionId }),
      ...(options?.forkSession && { forkSession: options.forkSession }),
    });

    this.sessionId = response.sessionId;

    this.parseSessionCapabilities(response);

    // Debug: log full session/new response only when ACP_PERF=1
    if (ACP_PERF_LOG) {
      console.log(`[ACP ${this.backend}] session/new response:`, JSON.stringify(response, null, 2));
    }

    return response;
  }

  /**
   * Load/resume an existing session using the ACP session/load method.
   * Codex ACP bridge implements `load_session()` which internally calls
   * `resume_thread_from_rollout` to restore full conversation history from disk.
   *
   * @param sessionId - The session ID to load/resume
   * @param cwd - Working directory for the session
   */
  async loadSession(sessionId: string, cwd: string = process.cwd()): Promise<AcpResponse & { sessionId?: string }> {
    const normalizedCwd = this.normalizeCwdForAgent(cwd);

    const response = await this.sendRequest<AcpResponse & { sessionId?: string }>('session/load', {
      sessionId,
      cwd: normalizedCwd,
      mcpServers: [] as unknown[],
    });

    // session/load returns modes/models/configOptions but not sessionId — keep the one we sent
    this.sessionId = response.sessionId || sessionId;

    mainLog(`[ACP ${this.backend}]`, 'session/load completed', { sessionId: this.sessionId });

    this.parseSessionCapabilities(response);

    return response;
  }

  /**
   * Parse configOptions and models from a session response (session/new or session/load).
   * Logs model info for Codex backend.
   */
  private parseSessionCapabilities(response: unknown): void {
    const result = response as Record<string, unknown>;
    if (Array.isArray(result.configOptions)) {
      this.configOptions = result.configOptions as AcpSessionConfigOption[];
    }
    // Check top-level models first, then fall back to _meta.models (used by iFlow)
    const modelsSource = result.models || (result._meta as Record<string, unknown> | undefined)?.models;
    if (modelsSource && typeof modelsSource === 'object') {
      this.models = modelsSource as AcpSessionModels;
    }
    if (this.backend === 'codex') {
      const unifiedModelInfo = buildAcpModelInfo(this.configOptions, this.models);
      const modelOption = this.configOptions?.find((opt) => opt.category === 'model');
      mainLog('[ACP codex]', 'session capabilities parsed', {
        rawCurrentModelId: this.models?.currentModelId || null,
        rawAvailableModelCount: this.models?.availableModels?.length || 0,
        configOptionModelCount:
          modelOption && modelOption.type === 'select' && modelOption.options ? modelOption.options.length : 0,
        unified: summarizeAcpModelInfo(unifiedModelInfo),
      });
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
    if (ACP_PERF_LOG) console.log(`[ACP-PERF] send: prompt sent to ${this.backend}`);

    this.startPromptKeepalive();
    try {
      return await this.sendRequest('session/prompt', {
        sessionId: this.sessionId,
        prompt: [{ type: 'text', text: prompt }],
      });
    } finally {
      this.stopPromptKeepalive();
    }
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

    return await this.sendRequest('session/set_mode', {
      sessionId: this.sessionId,
      modeId,
    });
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

  async disconnect(): Promise<void> {
    this.stopPromptKeepalive();
    await this.terminateChild();

    // Reset session-level state
    this.pendingRequests.clear();
    this.sessionId = null;
    this.isInitialized = false;
    this.isSetupComplete = false;
    this.backend = null;
    this.initializeResponse = null;
    this.configOptions = null;
    this.models = null;
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

  getInitializeResponse(): AcpResponse | null {
    return this.initializeResponse;
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
