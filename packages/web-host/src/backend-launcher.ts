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
import { createServer } from 'node:net';
import type { AppMetadata, BackendBinaryResolver } from './types.js';

type BackendStatus = 'stopped' | 'starting' | 'running' | 'error';
type BackendStartupStage = 'resolve_binary' | 'find_port' | 'spawn' | 'spawn_error' | 'early_exit' | 'health_timeout';

type HealthCheckDiagnostics = {
  healthCheckAttempts: number;
  healthCheckLastError?: string;
  healthCheckLastStatus?: number;
  healthCheckLastBody?: string;
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
  healthCheckLastError?: string;
  healthCheckLastStatus?: number;
  healthCheckLastBody?: string;
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

export function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.on('error', reject);
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

function getResolveDiagnostics(error: unknown): Partial<BackendStartupErrorDetails> | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') return undefined;
  return diagnostics as Partial<BackendStartupErrorDetails>;
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
    options?: BackendStartOptions
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
      this._port = await findAvailablePort();
    } catch (error) {
      throw new BackendStartupError(
        'aioncore startup failed while finding an available port',
        {
          stage: 'find_port',
          appVersion,
          isPackaged: this.appMeta.isPackaged,
          binaryPath,
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
          causeMessage: getErrorMessage(cause),
          stdoutTail: stdoutTail || undefined,
          stderrTail: stderrTail || undefined,
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
      });
    } catch (error) {
      this._status = 'error';
      throw makeStartupError('spawn', 'aioncore process spawn threw before startup', error);
    }

    this.childProcess.stdin?.end();

    const pid = this.childProcess.pid;
    const killOnExit = () => {
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
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
        if (this._status === 'running') this.handleCrash(code);
      });
    });

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      stdoutTail = appendOutputTail(stdoutTail, data);
      for (const line of data.toString().split('\n')) {
        if (line.trim()) console.log(`[aioncore] ${line}`);
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
        this.continueWaitingForHealth(this._port, this.childProcess, options.onReady);
        return this._port;
      }
      startupSettled = true;
      this.childProcess?.kill('SIGKILL');
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
    this._status = 'stopped';

    this.childProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.childProcess?.kill('SIGKILL');
        resolve();
      }, 5000);
      this.childProcess?.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    this.childProcess = null;
  }

  private async waitForHealth(
    port: number,
    timeoutMs = 30_000,
    shouldContinue: () => boolean = () => true
  ): Promise<HealthCheckResult> {
    const start = Date.now();
    const diagnostics: HealthCheckDiagnostics = { healthCheckAttempts: 0 };
    while (Date.now() - start < timeoutMs && shouldContinue()) {
      diagnostics.healthCheckAttempts += 1;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) return { ok: true, diagnostics };
        diagnostics.healthCheckLastStatus = response.status;
        delete diagnostics.healthCheckLastError;
        try {
          diagnostics.healthCheckLastBody = (await response.text()).slice(0, 500);
        } catch (error) {
          delete diagnostics.healthCheckLastBody;
          diagnostics.healthCheckLastError = getErrorMessage(error);
        }
      } catch (error) {
        diagnostics.healthCheckLastError = getErrorMessage(error);
        delete diagnostics.healthCheckLastStatus;
        delete diagnostics.healthCheckLastBody;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return { ok: false, diagnostics };
  }

  private continueWaitingForHealth(
    port: number,
    childProcess: ChildProcess,
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
      console.log(`[aioncore] listening on port ${port}, data-dir: ${this._lastDbPath}`);
      await onReady?.(port);
    })().catch((error) => {
      console.error('[aioncore] background health wait failed:', error);
    });
  }

  private handleCrash(_code: number | null): void {
    const now = Date.now();
    if (now - this.restartWindowStart > this.restartWindowMs) {
      this.restartCount = 0;
      this.restartWindowStart = now;
    }
    this.restartCount++;

    if (this.restartCount > this.maxRestarts) {
      this._status = 'error';
      return;
    }

    const delay = Math.pow(2, this.restartCount - 1) * 1000;
    setTimeout(() => {
      if (this._status === 'stopped') return;
      this._status = 'starting';
      this.start(this._lastDbPath, this._lastLogDir, this._lastDirs).catch(() => {
        this._status = 'error';
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
