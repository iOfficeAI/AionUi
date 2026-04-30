/**
 * Lifecycle manager for the aionui-backend subprocess.
 *
 * Handles spawning, health-checking, graceful shutdown, and automatic
 * restart with exponential back-off on unexpected crashes.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { app } from 'electron';
import { resolveBinaryPath } from './binaryResolver';

type BackendStatus = 'stopped' | 'starting' | 'running' | 'error';

type SpawnConfig = {
  port: number;
  dbPath: string;
  local: boolean;
  logDir?: string;
  appVersion: string;
};

export type BackendDirConfig = {
  cacheDir: string;
  workDir: string;
  logDir: string;
};

export function buildSpawnArgs(config: SpawnConfig): string[] {
  const logLevel = process.env.AIONUI_LOG_LEVEL || (app.isPackaged ? 'info' : 'debug');
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
  if (config.local) args.push('--local');
  return args;
}

/**
 * Backend reads AIONUI_{CACHE,WORK,LOG}_DIR env vars to report system dirs
 * (see aionui-backend/crates/aionui-system/src/sysinfo.rs). Inject them so the
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

  get port(): number {
    return this._port;
  }

  get status(): BackendStatus {
    return this._status;
  }

  async start(dbPath: string, logDir?: string, dirs?: BackendDirConfig): Promise<number> {
    const binaryPath = resolveBinaryPath();
    const appVersion = app.getVersion();
    this._port = await findAvailablePort();
    this._status = 'starting';
    this._lastDbPath = dbPath;
    this._lastLogDir = logDir;
    this._lastDirs = dirs;

    const args = buildSpawnArgs({ port: this._port, dbPath, local: true, logDir, appVersion });
    console.log(`[aionui-backend] starting: ${binaryPath} ${args.join(' ')}`);

    this.childProcess = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: dirs ? buildSpawnEnv(dirs) : process.env,
    });

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

    this.childProcess.on('exit', (code) => {
      process.removeListener('exit', killOnExit);
      if (this._status === 'running') this.handleCrash(code);
    });

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) console.log(`[aionui-backend] ${line}`);
      }
    });

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) console.error(`[aionui-backend] ${line}`);
      }
    });

    const ready = await this.waitForHealth(this._port);
    if (!ready) {
      this.childProcess?.kill('SIGKILL');
      this.childProcess = null;
      this._status = 'error';
      throw new Error('aionui-backend failed to start within timeout');
    }

    this._status = 'running';
    this.restartCount = 0;
    console.log(`[aionui-backend] listening on port ${this._port}, data-dir: ${dbPath}`);
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

  private async waitForHealth(port: number, timeoutMs = 30_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) return true;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
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
