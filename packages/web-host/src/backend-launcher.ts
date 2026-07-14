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
import { mkdirSync } from 'node:fs';
import { connect, createServer, type Socket } from 'node:net';
import { cleanupRegisteredAgentProcesses } from './agent-process-registry.js';
import type { AppMetadata, BackendBinaryResolver } from './types.js';

type BackendStatus = 'stopped' | 'starting' | 'running' | 'error';
type BackendStartupStage =
  | 'resolve_binary'
  | 'find_port'
  | 'spawn'
  | 'spawn_error'
  | 'early_exit'
  | 'listen_timeout'
  | 'health_timeout';

type HealthCheckDiagnostics = {
  healthCheckAttempts: number;
  healthCheckUrl?: string;
  healthCheckTimeoutMs?: number;
  healthCheckIntervalMs?: number;
  healthCheckExpectedAttempts?: number;
  healthCheckAttemptDeficit?: number;
  healthCheckElapsedMs?: number;
  healthCheckLastAttemptAfterMs?: number;
  healthCheckLastAttemptGapMs?: number;
  healthCheckMaxAttemptGapMs?: number;
  healthCheckTimeoutOverrunMs?: number;
  healthCheckPollingDelayed?: boolean;
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

type ParsedBackendBoundaryError = {
  code: string;
  stage?: string;
};

type SpawnConfig = {
  port: number;
  dbPath: string;
  local: boolean;
  parentPid?: number;
  logDir?: string;
  workDir?: string;
  appVersion: string;
  isPackaged: boolean;
  recoverCorruptedDatabase?: boolean;
};

export type BackendLaunchFlags = {
  recoverCorruptedDatabase?: boolean;
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
  backendBoundaryCode?: string;
  backendBoundaryStage?: string;
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
  healthCheckExpectedAttempts?: number;
  healthCheckAttemptDeficit?: number;
  healthCheckElapsedMs?: number;
  healthCheckLastAttemptAfterMs?: number;
  healthCheckLastAttemptGapMs?: number;
  healthCheckMaxAttemptGapMs?: number;
  healthCheckTimeoutOverrunMs?: number;
  healthCheckPollingDelayed?: boolean;
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
    ...(typeof config.parentPid === 'number' ? ['--parent-pid', String(config.parentPid)] : []),
    '--log-level',
    logLevel,
    '--app-version',
    config.appVersion,
  ];
  if (config.isPackaged) args.push('--managed-resources-mode', 'bundled');
  if (!config.isPackaged && process.env.AIONUI_DUMP_PROMPTS === '1') args.push('--dump-prompts');
  if (config.logDir) args.push('--log-dir', config.logDir);
  if (config.workDir) args.push('--work-dir', config.workDir);
  if (config.local) args.push('--local');
  if (config.recoverCorruptedDatabase) args.push('--recover-corrupted-database');
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

const FETCH_FORBIDDEN_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000,
  6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

const FETCH_COMPATIBLE_PORT_MAX_ATTEMPTS = 50;
const AIONCORE_LISTENING_PREFIX = 'AIONCORE_LISTENING ';
const BACKEND_PORT_REPORT_TIMEOUT_MS = 30_000;

function isFetchForbiddenPort(port: number): boolean {
  return FETCH_FORBIDDEN_PORTS.has(port);
}

export function findAvailablePort(
  preferredPort?: number,
  maxAttempts = FETCH_COMPATIBLE_PORT_MAX_ATTEMPTS
): Promise<number> {
  if (maxAttempts < 1) {
    return Promise.reject(new Error('Failed to get a fetch-compatible port'));
  }

  const firstRequestedPort = preferredPort && !isFetchForbiddenPort(preferredPort) ? preferredPort : 0;
  if (preferredPort && firstRequestedPort === 0) {
    console.info(`[aioncore] skipped fetch-blocked backend port ${preferredPort}`);
  }

  const tryPort = (requestedPort: number, remainingAttempts: number, attempt: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const server = createServer();

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
          requestedPort > 0
            ? requestedPort
            : addr && typeof addr !== 'string' && typeof addr.port === 'number'
              ? addr.port
              : 0;

        server.close(() => {
          cleanup();
          if (resolvedPort > 0 && !isFetchForbiddenPort(resolvedPort)) {
            console.info(`[aioncore] selected backend port ${resolvedPort} after ${attempt} attempts`);
            resolve(resolvedPort);
            return;
          }
          if (resolvedPort > 0 && remainingAttempts > 1) {
            console.info(`[aioncore] skipped fetch-blocked backend port ${resolvedPort}`);
            tryPort(0, remainingAttempts - 1, attempt + 1).then(resolve, reject);
            return;
          }
          reject(new Error('Failed to get a fetch-compatible port'));
        });
      });
    });

  return tryPort(firstRequestedPort, maxAttempts, 1);
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

function parseBackendBoundaryError(text: string): ParsedBackendBoundaryError | undefined {
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const match = /^(BOOTSTRAP_[A-Z0-9_]+|CLI_[A-Z0-9_]+|MCP_[A-Z0-9_]+)\b(?:[^\n]*?\bstage=([^:\s]+))?/.exec(line);
    if (match) {
      return { code: match[1], stage: match[2] };
    }
  }
  return undefined;
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

function parseAioncoreListeningPort(line: string): number | undefined {
  if (!line.startsWith(AIONCORE_LISTENING_PREFIX)) return undefined;
  try {
    const parsed = JSON.parse(line.slice(AIONCORE_LISTENING_PREFIX.length)) as { port?: unknown };
    if (typeof parsed.port !== 'number' || !Number.isInteger(parsed.port)) return undefined;
    if (parsed.port <= 0 || parsed.port > 65535) return undefined;
    return parsed.port;
  } catch {
    return undefined;
  }
}

function getResolveDiagnostics(error: unknown): Partial<BackendStartupErrorDetails> | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') return undefined;
  return diagnostics as Partial<BackendStartupErrorDetails>;
}

function ensureBackendStartupDirectory(dir: string | undefined): void {
  if (!dir || dir.trim() === '') return;
  mkdirSync(dir, { recursive: true });
}

function waitForChildProcessEnd(childProcess: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      childProcess.removeListener('error', finish);
      childProcess.removeListener('exit', finish);
      childProcess.removeListener('close', finish);
      resolve();
    };

    childProcess.once('error', finish);
    childProcess.once('exit', finish);
    childProcess.once('close', finish);
  });
}

function killBackendProcessTree(childProcess: ChildProcess | null, signal: 'SIGTERM' | 'SIGKILL'): Promise<void> {
  if (!childProcess?.pid) return Promise.resolve();

  if (process.platform === 'win32') {
    const args = ['/PID', String(childProcess.pid), '/T'];
    if (signal === 'SIGKILL') {
      args.unshift('/F');
    }
    try {
      const taskkillProcess = spawn('taskkill', args, {
        stdio: 'ignore',
        windowsHide: true,
      });
      taskkillProcess.unref();
      return waitForChildProcessEnd(taskkillProcess);
    } catch {
      /* best-effort tree kill */
    }
    return Promise.resolve();
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
  return Promise.resolve();
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
  private _lastOptions?: BackendStartOptions;
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
    preferredPort?: number,
    launchFlags: BackendLaunchFlags = {}
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
    this._port = preferredPort ?? 0;
    this._status = 'starting';
    this._lastDbPath = dbPath;
    this._lastLogDir = logDir;
    this._lastDirs = dirs;
    this._lastOptions = options;
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
    ) => {
      const boundary = parseBackendBoundaryError(stderrTail);
      return new BackendStartupError(
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
          backendBoundaryCode: boundary?.code,
          backendBoundaryStage: boundary?.stage,
          stdoutTail: stdoutTail || undefined,
          stderrTail: stderrTail || undefined,
          serverListeningObserved,
          serverListeningObservedAfterMs,
          serverListeningLine,
          ...extra,
        },
        cause
      );
    };

    const args = buildSpawnArgs({
      port: this._port,
      dbPath,
      local: true,
      parentPid: process.pid,
      logDir,
      workDir: dirs?.workDir,
      appVersion,
      isPackaged: this.appMeta.isPackaged,
      recoverCorruptedDatabase: launchFlags.recoverCorruptedDatabase === true,
    });
    console.log(`[aioncore] starting: ${binaryPath} ${args.join(' ')}`);

    try {
      ensureBackendStartupDirectory(dbPath);
      ensureBackendStartupDirectory(logDir);
      ensureBackendStartupDirectory(dirs?.cacheDir);
      ensureBackendStartupDirectory(dirs?.workDir);
      ensureBackendStartupDirectory(dirs?.logDir);
    } catch (error) {
      this._status = 'error';
      throw makeStartupError('spawn', 'aioncore startup directory preparation failed', error);
    }

    try {
      this.childProcess = spawn(binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: dirs ? buildSpawnEnv(dirs) : process.env,
        cwd: dirs?.workDir ?? dbPath,
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
      if (pid) void killBackendProcessTree(this.childProcess, 'SIGKILL');
    };
    process.on('exit', killOnExit);

    const startupFailure = new Promise<never>((_resolve, reject) => {
      let failureSettled = false;
      let pendingStartupExit:
        | {
            code: number | null;
            signal: NodeJS.Signals | null;
            startupSettledAtExit: boolean;
            statusAtExit: BackendStatus;
          }
        | undefined;
      const rejectOnce = (error: unknown) => {
        if (failureSettled) return;
        failureSettled = true;
        reject(error);
      };

      this.childProcess?.once('error', (error) => {
        if (startupSettled) return;
        this._status = 'error';
        rejectOnce(makeStartupError('spawn_error', 'aioncore process emitted an error before startup', error));
      });

      this.childProcess?.once('exit', (code, signal) => {
        process.removeListener('exit', killOnExit);
        if (this._status === 'running') {
          this.handleCrash(code, signal);
          return;
        }
        pendingStartupExit = {
          code,
          signal,
          startupSettledAtExit: startupSettled,
          statusAtExit: this._status,
        };
        if (this._status !== 'stopped') this._status = 'error';
      });

      this.childProcess?.once('close', (code, signal) => {
        if (!pendingStartupExit) return;
        const exitCode = pendingStartupExit.code ?? code;
        const exitSignal = pendingStartupExit.signal ?? signal;
        if (!pendingStartupExit.startupSettledAtExit) {
          if (pendingStartupExit.statusAtExit === 'stopped') {
            rejectOnce(new BackendStartupCancelledError('aioncore startup cancelled before health check passed'));
            return;
          }
          rejectOnce(
            makeStartupError('early_exit', 'aioncore exited before health check passed', undefined, {
              exitCode: exitCode ?? undefined,
              signal: exitSignal ?? undefined,
            })
          );
          return;
        }
        if (pendingStartupExit.statusAtExit === 'starting') {
          void Promise.resolve(
            options?.onPendingExit?.(
              makeStartupError('early_exit', 'aioncore exited after startup health timeout', undefined, {
                exitCode: exitCode ?? undefined,
                signal: exitSignal ?? undefined,
              })
            )
          ).catch((error) => {
            console.error('[aioncore] pending exit handler failed:', error);
          });
        }
      });
    });

    let reportedPortSettled = false;
    let reportedPortTimer: ReturnType<typeof setTimeout> | undefined;
    let resolveReportedPort: (port: number) => void = () => {};
    let rejectReportedPort: (error: BackendStartupError) => void = () => {};
    const reportedPort = new Promise<number>((resolve, reject) => {
      resolveReportedPort = (port) => {
        if (reportedPortSettled) return;
        reportedPortSettled = true;
        if (reportedPortTimer) clearTimeout(reportedPortTimer);
        resolve(port);
      };
      rejectReportedPort = (error) => {
        if (reportedPortSettled) return;
        reportedPortSettled = true;
        reject(error);
      };
      reportedPortTimer = setTimeout(() => {
        rejectReportedPort(
          makeStartupError('listen_timeout', 'aioncore did not report its listening port before timeout', undefined, {
            healthCheckTimeoutMs: BACKEND_PORT_REPORT_TIMEOUT_MS,
            healthCheckElapsedMs: Date.now() - startupStartedAt,
          })
        );
      }, BACKEND_PORT_REPORT_TIMEOUT_MS);
    });

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      stdoutTail = appendOutputTail(stdoutTail, data);
      for (const line of data.toString().split('\n')) {
        const trimmed = line.trim();
        const port = parseAioncoreListeningPort(trimmed);
        if (port !== undefined) {
          this._port = port;
          serverListeningObserved = true;
          serverListeningObservedAfterMs = Date.now() - startupStartedAt;
          serverListeningLine = trimmed;
          resolveReportedPort(port);
        } else if (
          !serverListeningObserved &&
          this._port > 0 &&
          trimmed.includes(`Server listening on 127.0.0.1:${this._port}`)
        ) {
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

    let port: number;
    try {
      port = await Promise.race([reportedPort, startupFailure]);
    } catch (error) {
      if (error instanceof BackendStartupError && error.details.stage === 'listen_timeout') {
        startupSettled = true;
        await killBackendProcessTree(this.childProcess, 'SIGKILL');
        this.childProcess = null;
        this._status = 'error';
      }
      throw error;
    }
    const health = await Promise.race([this.waitForHealth(port), startupFailure]);
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
      await killBackendProcessTree(this.childProcess, 'SIGKILL');
      this.childProcess = null;
      this._status = 'error';
      throw healthTimeoutError;
    }

    startupSettled = true;
    this._status = 'running';
    this.restartCount = 0;
    console.info(
      `[aioncore] health ready on port ${this._port} after ${health.diagnostics.healthCheckAttempts} attempts, elapsed_ms=${health.diagnostics.healthCheckElapsedMs}, data-dir: ${dbPath}`
    );
    return this._port;
  }

  async stop(): Promise<void> {
    if (!this.childProcess) return;
    const childProcess = this.childProcess;
    this._status = 'stopped';
    const dataDir = this._lastDbPath;

    const gracefulKill = killBackendProcessTree(childProcess, 'SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        void killBackendProcessTree(childProcess, 'SIGKILL').finally(resolve);
      }, 5000);
      childProcess.on('exit', () => {
        clearTimeout(timeout);
        void gracefulKill.finally(resolve);
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
    const expectedAttempts = Number.isFinite(timeoutMs) ? Math.ceil(timeoutMs / intervalMs) : undefined;
    const diagnostics: HealthCheckDiagnostics = {
      healthCheckAttempts: 0,
      healthCheckUrl,
      healthCheckIntervalMs: intervalMs,
      healthCheckTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      healthCheckExpectedAttempts: expectedAttempts,
    };
    let previousAttemptAt: number | undefined;
    while (Date.now() - start < timeoutMs && shouldContinue()) {
      const attemptStartedAt = Date.now();
      if (previousAttemptAt !== undefined) {
        const attemptGapMs = attemptStartedAt - previousAttemptAt;
        diagnostics.healthCheckLastAttemptGapMs = attemptGapMs;
        diagnostics.healthCheckMaxAttemptGapMs = Math.max(diagnostics.healthCheckMaxAttemptGapMs ?? 0, attemptGapMs);
      }
      previousAttemptAt = attemptStartedAt;
      diagnostics.healthCheckAttempts += 1;
      diagnostics.healthCheckLastAttemptAfterMs = attemptStartedAt - start;
      try {
        const response = await fetch(healthCheckUrl);
        if (response.ok) {
          diagnostics.healthCheckElapsedMs = Date.now() - start;
          return { ok: true, diagnostics };
        }
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
      diagnostics.healthCheckAttemptDeficit = Math.max(0, (expectedAttempts ?? 0) - diagnostics.healthCheckAttempts);
      diagnostics.healthCheckTimeoutOverrunMs = Math.max(0, diagnostics.healthCheckElapsedMs - timeoutMs);
      diagnostics.healthCheckPollingDelayed =
        (diagnostics.healthCheckMaxAttemptGapMs ?? 0) > intervalMs * 3 ||
        diagnostics.healthCheckTimeoutOverrunMs > intervalMs * 3;
    }
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
      const elapsedMs = health.diagnostics.healthCheckElapsedMs ?? Date.now() - startupStartedAt;
      console.info(
        `[aioncore] late health ready on port ${port} after ${health.diagnostics.healthCheckAttempts} attempts, elapsed_ms=${elapsedMs}, data-dir: ${this._lastDbPath}`
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

    const crashContext = {
      exitCode: code ?? undefined,
      signal: signal ?? undefined,
      port: this._port,
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
      this.start(this._lastDbPath, this._lastLogDir, this._lastDirs, this._lastOptions, this._port)
        .then(async (port) => {
          if (this._status === 'running') {
            await this._lastOptions?.onReady?.(port);
          }
        })
        .catch((error) => {
          this._status = 'error';
          console.error('[aioncore] restart after crash failed', {
            port: this._port,
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
