/**
 * Lifecycle manager for the aioncore subprocess (web-host version).
 *
 * Migrated from packages/desktop/src/process/backend/lifecycleManager.ts in M4.
 * Electron dependency removed: `app.*` replaced with constructor-injected
 * `AppMetadata`, and binary path resolved by injected `BackendBinaryResolver`.
 * Runtime behavior (spawn args, /health timeout, SIGTERM/SIGKILL, crash
 * restart window) is byte-for-byte preserved from the original.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { connect, createServer, type Socket } from 'node:net';
import { cleanupRegisteredAgentProcesses } from './agent-process-registry.js';
import type { AppMetadata, BackendBinaryResolver } from './types.js';

type BackendStatus = 'stopped' | 'starting' | 'running' | 'error';
type BackendStartupStage = 'resolve_binary' | 'find_port' | 'spawn' | 'spawn_error' | 'early_exit' | 'health_timeout';

type HealthCheckDiagnostics = {
  healthCheckAttempts: number;
  healthCheckUrl?: string;
  healthCheckTimeoutMs?: number;
  healthCheckIntervalMs?: number;
  healthCheckElapsedMs?: number;
  healthCheckLastAttemptAfterMs?: number;
  healthCheckLastError?: string;
  healthCheckLastErrorName?: string;
  healthCheckLastErrorCauseMessage?: string;
  healthCheckLastErrorCauseCode?: string;
  healthCheckLastStatus?: number;
  healthCheckLastBody?: string;
  healthCheckTcpProbeOk?: boolean;
  healthCheckTcpProbeError?: string;
  healthCheckTcpProbeErrorName?: string;
  healthCheckTcpProbeErrorCode?: string;
  healthCheckTcpProbeElapsedMs?: number;
  healthCheckTcpProbeTimeoutMs?: number;
};

type HealthCheckResult = {
  ok: boolean;
  diagnostics: HealthCheckDiagnostics;
};

type SpawnConfig = {
  port: number;
  dbPath: string;
  local: boolean;
  logDir?: string;
  workDir?: string;
  appVersion: string;
  isPackaged: boolean;
};

export type BackendDirConfig = {
  cacheDir: string;
  workDir: string;
  logDir: string;
};

export type BackendLaunchOptions = {
  app: AppMetadata;
  resolveBackend: BackendBinaryResolver;
  port?: number;
  dataDir?: string;
  logDir?: string;
  /**
   * System dirs exposed to the backend via AIONUI_{CACHE,WORK,LOG}_DIR env.
   * Surfaces on `/api/system/info`. If omitted, the backend inherits
   * process.env and will likely report wrong/empty dirs.
   */
  dirs?: BackendDirConfig;
};

export type BackendHandle = {
  port: number;
  stop: () => Promise<void>;
};

export type BackendStartupErrorDetails = {
  stage: BackendStartupStage;
  appVersion: string;
  isPackaged?: boolean;
  binaryPath?: string;
  port?: number;
  dataDir?: string;
  logDir?: string;
  workDir?: string;
  backendPid?: number;
  exitCode?: number;
  signal?: NodeJS.Signals | string;
  causeMessage?: string;
  stdoutTail?: string;
  stderrTail?: string;
  resourcesPath?: string;
  runtimeKey?: string;
  binaryName?: string;
  checkedBundledPath?: string;
  bundledDirExists?: boolean;
  runtimeDirExists?: boolean;
  resourcesDirEntries?: string[];
  runtimeDirEntries?: string[];
  pathLookupCommand?: string;
  pathLookupResult?: string;
  pathLookupError?: string;
  healthCheckAttempts?: number;
  healthCheckUrl?: string;
  healthCheckTimeoutMs?: number;
  healthCheckIntervalMs?: number;
  healthCheckElapsedMs?: number;
  healthCheckLastAttemptAfterMs?: number;
  healthCheckLastError?: string;
  healthCheckLastErrorName?: string;
  healthCheckLastErrorCauseMessage?: string;
  healthCheckLastErrorCauseCode?: string;
  healthCheckLastStatus?: number;
  healthCheckLastBody?: string;
  healthCheckTcpProbeOk?: boolean;
  healthCheckTcpProbeError?: string;
  healthCheckTcpProbeErrorName?: string;
  healthCheckTcpProbeErrorCode?: string;
  healthCheckTcpProbeElapsedMs?: number;
  healthCheckTcpProbeTimeoutMs?: number;
  serverListeningObserved?: boolean;
  serverListeningObservedAfterMs?: number;
  serverListeningLine?: string;
};

export type BackendStartOptions = {
  allowPendingOnHealthTimeout?: boolean;
  onHealthTimeout?: (error: BackendStartupError) => Promise<void> | void;
  onPendingExit?: (error: BackendStartupError) => Promise<void> | void;
  onReady?: (port: number) => Promise<void> | void;
};

export class BackendStartupError extends Error {
  readonly details: BackendStartupErrorDetails;
  readonly cause?: unknown;

  constructor(message: string, details: BackendStartupErrorDetails, cause?: unknown) {
    super(message);
    this.name = 'BackendStartupError';
    this.details = details;
    this.cause = cause;
  }
}

export class BackendStartupCancelledError extends Error {
  constructor(message = 'aioncore startup cancelled') {
    super(message);
    this.name = 'BackendStartupCancelledError';
  }
}

export function buildSpawnArgs(config: SpawnConfig): string[] {
  const logLevel = process.env.AIONUI_LOG_LEVEL || (config.isPackaged ? 'info' : 'debug');
  const args = [
    '--port',
    String(config.port),
    '--data-dir',
    config.dbPath,
    '--log-level',
    logLevel,
    '--app-version',
    config.appVersion,
  ];
  if (config.logDir) args.push('--log-dir', config.logDir);
  if (config.workDir) args.push('--work-dir', config.workDir);
  if (config.local) args.push('--local');
  return args;
}

/**
 * Backend reads AIONUI_{CACHE,WORK,LOG}_DIR env vars to report system dirs
 * (see AionCore/crates/aionui-system/src/sysinfo.rs). Inject them so the
 * backend's `/api/system/info` matches what Electron main persists in
 * ProcessEnv('aionui.dir').
 */
export function buildSpawnEnv(dirs: BackendDirConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AIONUI_CACHE_DIR: dirs.cacheDir,
    AIONUI_WORK_DIR: dirs.workDir,
    AIONUI_LOG_DIR: dirs.logDir,
  };
}

export function findAvailablePort(preferredPort?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    const requestedPort = preferredPort ?? 0;

    const cleanup = () => {
      server.removeAllListeners();
    };

    server.once('error', (error) => {
      cleanup();
      reject(error);
    });
    server.listen(requestedPort, '127.0.0.1', () => {
      const addr = server.address();
      const resolvedPort =
        preferredPort ?? (addr && typeof addr !== 'string' && typeof addr.port === 'number' ? addr.port : 0);

      server.close(() => {
        cleanup();
        if (resolvedPort > 0) {
          resolve(resolvedPort);
          return;
        }
        reject(new Error('Failed to get port'));
      });
    });
  });
}

function appendOutputTail(current: string, chunk: Buffer, maxLength = 4000): string {
  return (current + chunk.toString()).slice(-maxLength);
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return undefined;
}

function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name;
  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string') return code;
  if (typeof code === 'number') return String(code);
  return undefined;
}

function getErrorCause(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined;
  return (error as { cause?: unknown }).cause;
}

function applyHealthCheckErrorDiagnostics(diagnostics: HealthCheckDiagnostics, error: unknown): void {
  const cause = getErrorCause(error);
  diagnostics.healthCheckLastError = getErrorMessage(error);
  diagnostics.healthCheckLastErrorName = getErrorName(error);
  diagnostics.healthCheckLastErrorCauseMessage = getErrorMessage(cause);
  diagnostics.healthCheckLastErrorCauseCode = getErrorCode(cause);
}

function clearHealthCheckErrorDiagnostics(diagnostics: HealthCheckDiagnostics): void {
  delete diagnostics.healthCheckLastError;
  delete diagnostics.healthCheckLastErrorName;
  delete diagnostics.healthCheckLastErrorCauseMessage;
  delete diagnostics.healthCheckLastErrorCauseCode;
}

function getResolveDiagnostics(error: unknown): Partial<BackendStartupErrorDetails> | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') return undefined;
  return diagnostics as Partial<BackendStartupErrorDetails>;
}

function killBackendProcessTree(childProcess: ChildProcess | null, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (!childProcess?.pid) return;

  if (process.platform === 'win32') {
    const args = ['/PID', String(childProcess.pid), '/T'];
    if (signal === 'SIGKILL') {
      args.unshift('/F');
    }
    try {
      spawn('taskkill', args, {
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } catch {
      /* best-effort tree kill */
    }
    return;
  }

  try {
    process.kill(-childProcess.pid, signal);
  } catch {
    try {
      process.kill(childProcess.pid, signal);
    } catch {
      /* already exited */
    }
  }
}

async function probeHealthCheckTcpConnect(port: number, timeoutMs = 1_000): Promise<Partial<HealthCheckDiagnostics>> {
  const start = Date.now();
  return await new Promise((resolve) => {
    let settled = false;
    let socket: Socket | undefined;
    const finish = (diagnostics: Partial<HealthCheckDiagnostics>) => {
      if (settled) return;
      settled = true;
      socket?.destroy();
      resolve({
        ...diagnostics,
        healthCheckTcpProbeElapsedMs: Date.now() - start,
        healthCheckTcpProbeTimeoutMs: timeoutMs,
      });
    };

    try {
      socket = connect({ host: '127.0.0.1', port }, () => {
        finish({ healthCheckTcpProbeOk: true });
      });
      socket.once('error', (error) => {
        finish({
          healthCheckTcpProbeOk: false,
          healthCheckTcpProbeError: getErrorMessage(error),
          healthCheckTcpProbeErrorName: getErrorName(error),
          healthCheckTcpProbeErrorCode: getErrorCode(error),
        });
      });
      socket.setTimeout(timeoutMs, () => {
        finish({
          healthCheckTcpProbeOk: false,
          healthCheckTcpProbeError: `tcp connect timed out after ${timeoutMs}ms`,
          healthCheckTcpProbeErrorName: 'TimeoutError',
        });
      });
    } catch (error) {
      finish({
        healthCheckTcpProbeOk: false,
        healthCheckTcpProbeError: getErrorMessage(error),
        healthCheckTcpProbeErrorName: getErrorName(error),
        healthCheckTcpProbeErrorCode: getErrorCode(error),
      });
    }
  });
}

export class BackendLifecycleManager {
  private childProcess: ChildProcess | null = null;
  private _port = 0;
  private _status: BackendStatus = 'stopped';
  private _lastDbPath = '';
  private _lastLogDir?: string;
  private _lastDirs?: BackendDirConfig;
  private restartCount = 0;
  private restartWindowStart = 0;
  private readonly maxRestarts = 3;
  private readonly restartWindowMs = 60_000;

  constructor(
    private readonly appMeta: AppMetadata,
    private readonly resolveBackend: BackendBinaryResolver
  ) {}

  get port(): number {
    return this._port;
  }

  get status(): BackendStatus {
    return this._status;
  }

  async start(
    dbPath: string,
    logDir?: string,
    dirs?: BackendDirConfig,
    options?: BackendStartOptions,
    preferredPort?: number
  ): Promise<number> {
    const appVersion = this.appMeta.version;
    let binaryPath: string;
    try {
      binaryPath = this.resolveBackend();
    } catch (error) {
      const diagnostics = getResolveDiagnostics(error);
      throw new BackendStartupError(
        'aioncore startup failed while resolving backend binary',
        {
          stage: 'resolve_binary',
          appVersion,
          isPackaged: this.appMeta.isPackaged,
          dataDir: dbPath,
          logDir,
          workDir: dirs?.workDir,
          causeMessage: getErrorMessage(error),
          ...diagnostics,
        },
        error
      );
    }
    try {
      this._port = await findAvailablePort(preferredPort);
    } catch (error) {
      throw new BackendStartupError(
        'aioncore startup failed while finding an available port',
        {
          stage: 'find_port',
          appVersion,
          isPackaged: this.appMeta.isPackaged,
          binaryPath,
          port: preferredPort,
          dataDir: dbPath,
          logDir,
          workDir: dirs?.workDir,
          causeMessage: getErrorMessage(error),
        },
        error
      );
    }
    this._status = 'starting';
    this._lastDbPath = dbPath;
    this._lastLogDir = logDir;
    this._lastDirs = dirs;
    let stdoutTail = '';
    let stderrTail = '';
    let startupSettled = false;
    const startupStartedAt = Date.now();
    let serverListeningObserved = false;
    let serverListeningObservedAfterMs: number | undefined;
    let serverListeningLine: string | undefined;
    let backendPid: number | undefined;
    const makeStartupError = (
      stage: BackendStartupStage,
      message: string,
      cause?: unknown,
      extra?: Partial<BackendStartupErrorDetails>
    ) =>
      new BackendStartupError(
        message,
        {
          stage,
          appVersion,
          isPackaged: this.appMeta.isPackaged,
          binaryPath,
          port: this._port,
          dataDir: dbPath,
          logDir,
          workDir: dirs?.workDir,
          backendPid,
          causeMessage: getErrorMessage(cause),
          stdoutTail: stdoutTail || undefined,
          stderrTail: stderrTail || undefined,
          serverListeningObserved,
          serverListeningObservedAfterMs,
          serverListeningLine,
          ...extra,
        },
        cause
      );

    const args = buildSpawnArgs({
      port: this._port,
      dbPath,
      local: true,
      logDir,
      workDir: dirs?.workDir,
      appVersion,
      isPackaged: this.appMeta.isPackaged,
    });
    console.log(`[aioncore] starting: ${binaryPath} ${args.join(' ')}`);

    try {
      this.childProcess = spawn(binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: dirs ? buildSpawnEnv(dirs) : process.env,
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      this._status = 'error';
      throw makeStartupError('spawn', 'aioncore process spawn threw before startup', error);
    }

    this.childProcess.stdin?.end();

    backendPid = this.childProcess.pid;
    const pid = backendPid;
    const killOnExit = () => {
      if (pid) killBackendProcessTree(this.childProcess, 'SIGKILL');
    };
    process.on('exit', killOnExit);

    const startupFailure = new Promise<never>((_resolve, reject) => {
      this.childProcess?.once('error', (error) => {
        if (startupSettled) return;
        this._status = 'error';
        reject(makeStartupError('spawn_error', 'aioncore process emitted an error before startup', error));
      });

      this.childProcess?.once('exit', (code, signal) => {
        process.removeListener('exit', killOnExit);
        if (!startupSettled) {
          if (this._status === 'stopped') {
            reject(new BackendStartupCancelledError('aioncore startup cancelled before health check passed'));
            return;
          }
          this._status = 'error';
          reject(
            makeStartupError('early_exit', 'aioncore exited before health check passed', undefined, {
              exitCode: code ?? undefined,
              signal: signal ?? undefined,
            })
          );
          return;
        }
        if (this._status === 'starting') {
          this._status = 'error';
          void Promise.resolve(
            options?.onPendingExit?.(
              makeStartupError('early_exit', 'aioncore exited after startup health timeout', undefined, {
                exitCode: code ?? undefined,
                signal: signal ?? undefined,
              })
            )
          ).catch((error) => {
            console.error('[aioncore] pending exit handler failed:', error);
          });
          return;
        }
        if (this._status === 'running') this.handleCrash(code, signal);
      });
    });

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      stdoutTail = appendOutputTail(stdoutTail, data);
      for (const line of data.toString().split('\n')) {
        const trimmed = line.trim();
        if (!serverListeningObserved && trimmed.includes(`Server listening on 127.0.0.1:${this._port}`)) {
          serverListeningObserved = true;
          serverListeningObservedAfterMs = Date.now() - startupStartedAt;
          serverListeningLine = trimmed;
        }
        if (trimmed) console.log(`[aioncore] ${line}`);
      }
    });

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      stderrTail = appendOutputTail(stderrTail, data);
      for (const line of data.toString().split('\n')) {
        if (line.trim()) console.error(`[aioncore] ${line}`);
      }
    });

    const health = await Promise.race([this.waitForHealth(this._port), startupFailure]);
    if (!health.ok) {
      const healthTimeoutError = makeStartupError(
        'health_timeout',
        'aioncore failed to start within timeout',
        undefined,
        {
          ...health.diagnostics,
        }
      );
      if (options?.allowPendingOnHealthTimeout && this.childProcess) {
        startupSettled = true;
        console.warn(`[aioncore] health check timed out; keeping process alive on port ${this._port}`);
        void Promise.resolve(options.onHealthTimeout?.(healthTimeoutError)).catch((error) => {
          console.error('[aioncore] health timeout handler failed:', error);
        });
        this.continueWaitingForHealth(this._port, this.childProcess, startupStartedAt, options.onReady);
        return this._port;
      }
      startupSettled = true;
      killBackendProcessTree(this.childProcess, 'SIGKILL');
      this.childProcess = null;
      this._status = 'error';
      throw healthTimeoutError;
    }

    startupSettled = true;
    this._status = 'running';
    this.restartCount = 0;
    console.log(`[aioncore] listening on port ${this._port}, data-dir: ${dbPath}`);
    return this._port;
  }

  async stop(): Promise<void> {
    if (!this.childProcess) return;
    const childProcess = this.childProcess;
    this._status = 'stopped';
    const dataDir = this._lastDbPath;

    killBackendProcessTree(childProcess, 'SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        killBackendProcessTree(childProcess, 'SIGKILL');
        resolve();
      }, 5000);
      childProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await cleanupRegisteredAgentProcesses(dataDir);
    this.childProcess = null;
  }

  private async waitForHealth(
    port: number,
    timeoutMs = 30_000,
    shouldContinue: () => boolean = () => true
  ): Promise<HealthCheckResult> {
    const start = Date.now();
    const intervalMs = 200;
    const healthCheckUrl = `http://127.0.0.1:${port}/health`;
    const diagnostics: HealthCheckDiagnostics = {
      healthCheckAttempts: 0,
      healthCheckUrl,
      healthCheckIntervalMs: intervalMs,
      healthCheckTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    };
    while (Date.now() - start < timeoutMs && shouldContinue()) {
      diagnostics.healthCheckAttempts += 1;
      diagnostics.healthCheckLastAttemptAfterMs = Date.now() - start;
      try {
        const response = await fetch(healthCheckUrl);
        if (response.ok) return { ok: true, diagnostics };
        diagnostics.healthCheckLastStatus = response.status;
        clearHealthCheckErrorDiagnostics(diagnostics);
        try {
          diagnostics.healthCheckLastBody = (await response.text()).slice(0, 500);
        } catch (error) {
          delete diagnostics.healthCheckLastBody;
          applyHealthCheckErrorDiagnostics(diagnostics, error);
        }
      } catch (error) {
        applyHealthCheckErrorDiagnostics(diagnostics, error);
        delete diagnostics.healthCheckLastStatus;
        delete diagnostics.healthCheckLastBody;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    diagnostics.healthCheckElapsedMs = Date.now() - start;
    if (Number.isFinite(timeoutMs)) {
      Object.assign(diagnostics, await probeHealthCheckTcpConnect(port));
    }
    return { ok: false, diagnostics };
  }

  private continueWaitingForHealth(
    port: number,
    childProcess: ChildProcess,
    startupStartedAt: number,
    onReady?: (port: number) => Promise<void> | void
  ): void {
    void (async () => {
      const health = await this.waitForHealth(
        port,
        Number.POSITIVE_INFINITY,
        () => this.childProcess === childProcess && this._status === 'starting'
      );
      if (!health.ok || this.childProcess !== childProcess || this._status !== 'starting') return;
      this._status = 'running';
      this.restartCount = 0;
      const elapsedMs = Date.now() - startupStartedAt;
      console.log(
        `[aioncore] late health ready on port ${port}, elapsed_ms=${elapsedMs}, data-dir: ${this._lastDbPath}`
      );
      await onReady?.(port);
    })().catch((error) => {
      console.error('[aioncore] background health wait failed:', error);
    });
  }

  private handleCrash(code: number | null, signal?: NodeJS.Signals | string | null): void {
    const now = Date.now();
    if (now - this.restartWindowStart > this.restartWindowMs) {
      this.restartCount = 0;
      this.restartWindowStart = now;
    }
    this.restartCount++;

    const restartPort = this._port;
    const crashContext = {
      exitCode: code ?? undefined,
      signal: signal ?? undefined,
      port: restartPort,
      restartCount: this.restartCount,
      maxRestarts: this.maxRestarts,
    };

    if (this.restartCount > this.maxRestarts) {
      this._status = 'error';
      console.error('[aioncore] child exited unexpectedly; restart limit exceeded', crashContext);
      return;
    }

    const delay = Math.pow(2, this.restartCount - 1) * 1000;
    console.warn('[aioncore] child exited unexpectedly; scheduling restart', {
      ...crashContext,
      delayMs: delay,
    });

    setTimeout(() => {
      if (this._status === 'stopped') return;
      this._status = 'starting';
      this.start(this._lastDbPath, this._lastLogDir, this._lastDirs, undefined, restartPort).catch((error) => {
        this._status = 'error';
        console.error('[aioncore] restart after crash failed', {
          port: restartPort,
          restartCount: this.restartCount,
          maxRestarts: this.maxRestarts,
          delayMs: delay,
          error: getErrorMessage(error),
        });
      });
    }, delay);
  }
}

/**
 * Functional wrapper for ownBackend usage in startWebHost (M5 will consume).
 * Not used by desktop IPC path in M4 (desktop instantiates BackendLifecycleManager
 * directly to preserve current stop/port getter semantics).
 */
export async function startBackend(opts: BackendLaunchOptions): Promise<BackendHandle> {
  const manager = new BackendLifecycleManager(opts.app, opts.resolveBackend);
  const dataDir = opts.dataDir ?? '';
  if (!dataDir) {
    throw new Error('startBackend: dataDir is required');
  }
  const port = await manager.start(dataDir, opts.logDir, opts.dirs);
  return {
    port,
    stop: () => manager.stop(),
  };
}

/**
 * Functional wrapper kept for symmetry; prefers handle.stop() directly.
 */
export async function stopBackend(handle: BackendHandle): Promise<void> {
  await handle.stop();
}
