// src/process/acp/infra/ProcessAcpClient.ts

/**
 * ProcessAcpClient — Single owner of a local agent subprocess + ACP protocol.
 *
 * Internally manages:
 *   - Child process (via spawnFn callback — allows legacy and direct spawn)
 *   - Stderr ring buffer (8KB, captured from spawn time)
 *   - 4-signal lifecycle detection (exit, close, stdout.close, connection.abort)
 *   - Startup failure watcher (Promise.race: init vs process exit)
 *   - Pending request tracking (runConnectionRequest wraps every SDK call)
 *   - SDK ClientSideConnection
 *   - NdjsonTransport
 *   - Graceful 3-phase shutdown
 *
 * See docs/feature/acp-rewrite/02-reference-implementation.md §6.1-6.2
 */

import type {
  Client,
  InitializeResponse,
  LoadSessionResponse,
  NewSessionResponse,
  PromptResponse,
  SetSessionConfigOptionRequest,
} from '@agentclientprotocol/sdk';
import { ClientSideConnection, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { AgentDisconnectedError, AgentSpawnError, AgentStartupError } from '@process/acp/errors/AcpError';
import type { CreateSessionParams, LoadSessionParams } from '@process/acp/infra/AcpProtocol';
import type {
  AcpClient,
  AgentDisconnectReason,
  AgentExitInfo,
  AgentLifecycleSnapshot,
  DisconnectInfo,
} from '@process/acp/infra/IAcpClient';
import { NdjsonTransport } from '@process/acp/infra/NdjsonTransport';
import { gracefulShutdown, waitForExit, waitForSpawn } from '@process/acp/infra/processUtils';
import type { PromptContent, ProtocolHandlers } from '@process/acp/types';
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';

const STARTUP_STDERR_MAX = 8192;

type PendingRequest = {
  settled: boolean;
  reject: (error: unknown) => void;
};

export type ProcessAcpClientOptions = {
  backend: string;
  handlers: ProtocolHandlers;
  gracePeriodMs?: number;
};

export class ProcessAcpClient implements AcpClient {
  private child: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private closing = false;

  // Stderr ring buffer
  private stderrBuffer = '';

  // Lifecycle state (first-write-wins)
  private _lastExit: AgentExitInfo | null = null;
  private disconnectHandler: ((info: DisconnectInfo) => void) | null = null;
  private hasActivePrompt = false;

  // Pending request tracking
  private readonly pendingRequests = new Set<PendingRequest>();

  constructor(
    private readonly spawnFn: () => Promise<ChildProcess>,
    private readonly options: ProcessAcpClientOptions
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────

  get lifecycleSnapshot(): AgentLifecycleSnapshot {
    return {
      pid: this.child?.pid ?? null,
      running: this.child !== null && this._lastExit === null,
      lastExit: this._lastExit,
    };
  }

  onDisconnect(handler: (info: DisconnectInfo) => void): void {
    this.disconnectHandler = handler;
  }

  // ─── start() — spawn + init + startup failure watcher ─────

  async start(): Promise<InitializeResponse> {
    // 1. Spawn child process
    let child: ChildProcess;
    try {
      child = await this.spawnFn();
      await waitForSpawn(child);
    } catch (err) {
      throw new AgentSpawnError(this.options.backend, err);
    }
    this.child = child;

    // 2. Capture stderr from spawn time
    this.setupStderrCapture(child);

    // 3. Attach 4-signal lifecycle observers
    this.attachLifecycleObservers(child);

    // 4. Create transport + SDK connection
    const stream = NdjsonTransport.fromChildProcess(child);
    const connection = new ClientSideConnection(
      (_agent): Client => ({
        sessionUpdate: async (params) => this.options.handlers.onSessionUpdate(params),
        requestPermission: async (params) => this.options.handlers.onRequestPermission(params),
        readTextFile: async (params) => this.options.handlers.onReadTextFile(params),
        writeTextFile: async (params) => this.options.handlers.onWriteTextFile(params),
      }),
      stream
    );
    this.connection = connection;

    // Also listen for SDK connection abort
    connection.signal.addEventListener(
      'abort',
      () => this.recordAgentExit('connection_close', child.exitCode ?? null, child.signalCode ?? null),
      { once: true }
    );

    // 5. Promise.race: initialize vs startup failure watcher
    const startupFailure = this.createStartupFailureWatcher(child);
    try {
      const initResult = await Promise.race([
        this.runConnectionRequest(() =>
          connection.initialize({
            clientInfo: { name: 'AionUi', version: '2.0.0' },
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: {
              fs: { readTextFile: true, writeTextFile: true },
            },
          })
        ),
        startupFailure.promise,
      ]);
      startupFailure.dispose();
      console.debug(`[AcpClient:Initialized] <- ${JSON.stringify(initResult)}`);
      return initResult;
    } catch (err) {
      startupFailure.dispose();
      // Normalize SDK "ACP connection closed" into AgentStartupError
      throw await this.normalizeInitializeError(err, child);
    }
  }

  // ─── Protocol Methods (wrapped with runConnectionRequest) ──

  async createSession(params: CreateSessionParams): Promise<NewSessionResponse> {
    return this.runConnectionRequest(() =>
      this.conn.newSession({
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        additionalDirectories: params.additionalDirectories,
      })
    );
  }

  async loadSession(params: LoadSessionParams): Promise<LoadSessionResponse> {
    return this.runConnectionRequest(() =>
      this.conn.loadSession({
        sessionId: params.sessionId,
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        additionalDirectories: params.additionalDirectories,
      })
    );
  }

  async prompt(sessionId: string, content: PromptContent): Promise<PromptResponse> {
    this.hasActivePrompt = true;
    try {
      return await this.runConnectionRequest(() => this.conn.prompt({ sessionId, prompt: content }));
    } finally {
      this.hasActivePrompt = false;
    }
  }

  async cancel(sessionId: string): Promise<void> {
    await this.runConnectionRequest(() => this.conn.cancel({ sessionId }));
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.runConnectionRequest(() => this.conn.unstable_closeSession({ sessionId }));
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    await this.runConnectionRequest(() => this.conn.unstable_setSessionModel({ sessionId, modelId }));
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    await this.runConnectionRequest(() => this.conn.setSessionMode({ sessionId, modeId }));
  }

  async setConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<void> {
    const params: SetSessionConfigOptionRequest =
      typeof value === 'boolean' ? { sessionId, configId, type: 'boolean', value } : { sessionId, configId, value };
    await this.runConnectionRequest(() => this.conn.setSessionConfigOption(params));
  }

  async authenticate(methodId: string): Promise<unknown> {
    return this.runConnectionRequest(() => this.conn.authenticate({ methodId }));
  }

  async extMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
    return this.runConnectionRequest(() => this.conn.extMethod(method, params));
  }

  // ─── Shutdown ─────────────────────────────────────────────

  async close(): Promise<void> {
    this.closing = true;
    if (this.child) {
      await gracefulShutdown(this.child, this.options.gracePeriodMs ?? 100);
      this.child = null;
    }
    this.connection = null;
  }

  // ─── Internals: Connection accessor ────────────────────────

  private get conn(): ClientSideConnection {
    if (!this.connection) {
      throw new AgentDisconnectedError('connection_close', null, null);
    }
    return this.connection;
  }

  // ─── Internals: Pending request tracking ───────────────────

  /**
   * Wraps every SDK call. On disconnect, all pending requests are rejected
   * with AgentDisconnectedError (not the SDK's opaque "ACP connection closed").
   */
  private async runConnectionRequest<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const pending: PendingRequest = { settled: false, reject };
      this.pendingRequests.add(pending);

      const finish = (fn: () => void) => {
        if (pending.settled) return;
        pending.settled = true;
        this.pendingRequests.delete(pending);
        fn();
      };

      Promise.resolve()
        .then(run)
        .then(
          (value) => finish(() => resolve(value)),
          (error) => finish(() => reject(error))
        );
    });
  }

  private rejectPendingRequests(error: unknown): void {
    for (const pending of this.pendingRequests) {
      if (pending.settled) continue;
      pending.settled = true;
      this.pendingRequests.delete(pending);
      pending.reject(error);
    }
  }

  // ─── Internals: Stderr capture ────────────────────────────

  private setupStderrCapture(child: ChildProcess): void {
    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      console.error(`[ACP ${this.options.backend} STDERR]:`, chunk);
      this.stderrBuffer += chunk;
      if (this.stderrBuffer.length > STARTUP_STDERR_MAX) {
        this.stderrBuffer = this.stderrBuffer.slice(-STARTUP_STDERR_MAX);
      }
    });
  }

  // ─── Internals: 4-signal lifecycle detection ───────────────

  private attachLifecycleObservers(child: ChildProcess): void {
    child.once('exit', (code, signal) => {
      this.recordAgentExit('process_exit', code, signal);
    });
    child.once('close', (code, signal) => {
      this.recordAgentExit('process_close', code, signal);
    });
    child.stdout?.once('close', () => {
      this.recordAgentExit('pipe_close', child.exitCode ?? null, child.signalCode ?? null);
    });
    // connection_close is attached after ClientSideConnection is created (in start())
  }

  /**
   * First-write-wins: only the first signal records exit info.
   * Subsequent signals are ignored (idempotent).
   */
  private recordAgentExit(
    reason: AgentDisconnectReason,
    exitCode: number | null,
    signal: NodeJS.Signals | string | null
  ): void {
    if (this._lastExit) return;

    this._lastExit = {
      exitCode,
      signal: signal ? String(signal) : null,
      reason,
      stderr: this.stderrBuffer,
      unexpectedDuringPrompt: !this.closing && this.hasActivePrompt,
    };

    // Reject all pending SDK requests with our own error type
    const error = new AgentDisconnectedError(reason, exitCode, signal ? String(signal) : null, {
      outputAlreadyEmitted: this.hasActivePrompt,
    });
    this.rejectPendingRequests(error);

    // Notify disconnect handler
    if (this.disconnectHandler) {
      this.disconnectHandler({
        reason,
        exitCode,
        signal: signal ? String(signal) : null,
        stderr: this.stderrBuffer,
      });
    }
  }

  // ─── Internals: Startup failure watcher ────────────────────

  private createStartupFailureWatcher(child: ChildProcess): { promise: Promise<never>; dispose: () => void } {
    let rejectFn: ((err: Error) => void) | null = null;
    let disposed = false;

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (disposed) return;
      rejectFn?.(new AgentStartupError(this.options.backend, code, signal ? String(signal) : null, this.stderrBuffer));
    };

    const onError = (err: Error) => {
      if (disposed) return;
      rejectFn?.(new AgentSpawnError(this.options.backend, err));
    };

    child.on('exit', onExit);
    child.on('error', onError);

    const promise = new Promise<never>((_resolve, reject) => {
      rejectFn = reject;
    });

    const dispose = () => {
      disposed = true;
      child.off('exit', onExit);
      child.off('error', onError);
    };

    return { promise, dispose };
  }

  /**
   * When SDK throws "ACP connection closed" during init, convert to
   * AgentStartupError with stderr + exit code. Waits briefly for the
   * exit event to arrive (handles the race between stream close and exit).
   */
  private async normalizeInitializeError(error: unknown, child: ChildProcess): Promise<unknown> {
    if (error instanceof AgentStartupError || error instanceof AgentSpawnError) return error;

    const isConnectionClosed = error instanceof Error && /acp connection closed/i.test(error.message);
    if (!isConnectionClosed) return error;

    // Brief wait for exit event to capture exit code
    await waitForExit(child, 200);

    return new AgentStartupError(
      this.options.backend,
      child.exitCode ?? null,
      child.signalCode ? String(child.signalCode) : null,
      this.stderrBuffer,
      error
    );
  }

  // ─── Internals: bunx cache cleanup (from old prepareRetry) ─

  /**
   * If stderr indicates a corrupted bunx cache ("Cannot find package"),
   * clear the cache directory to allow a fresh install on retry.
   */
  clearBunxCacheIfNeeded(): void {
    if (!/Cannot find (?:package|module)/i.test(this.stderrBuffer)) return;

    const match = this.stderrBuffer.match(/([^\s'"]*[/\\]bunx-\d+[^\s/\\]*[/\\][^\s/\\]+@[^\s/\\]+)[/\\]node_modules/);
    if (!match) return;

    const cacheDir = match[1];
    console.log(`[AcpClient ${this.options.backend}] Clearing corrupted bunx cache: ${cacheDir}`);
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
