/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

interface GatewayManagerConfig {
  /** Path to openclaw CLI (default: 'openclaw') */
  cliPath?: string;
  /** Gateway port (default: 18789) */
  port?: number;
  /** Custom environment variables */
  customEnv?: Record<string, string>;
}

interface GatewayManagerEvents {
  ready: (port: number) => void;
  error: (error: Error) => void;
  exit: (info: { code: number | null; signal: NodeJS.Signals | null }) => void;
  stdout: (data: string) => void;
  stderr: (data: string) => void;
}

/**
 * OpenClaw Gateway Process Manager
 *
 * Manages the lifecycle of the `openclaw gateway` process.
 *
 * Responsibilities:
 * - Start/stop gateway process
 * - Port management
 * - Health detection
 * - Graceful shutdown
 */
export class OpenClawGatewayManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private readonly cliPath: string;
  private readonly port: number;
  private readonly customEnv?: Record<string, string>;
  private isStarting = false;
  private startPromise: Promise<number> | null = null;

  private static readonly MIN_NODE = { major: 22, minor: 12, patch: 0 } as const;

  constructor(config: GatewayManagerConfig = {}) {
    super();
    this.cliPath = config.cliPath || 'openclaw';
    this.port = config.port || 18789;
    this.customEnv = config.customEnv;
  }

  private resolveCommandPath(cmd: string, envPath?: string): string {
    // Absolute/relative paths: use as-is.
    if (cmd.includes('/') || cmd.includes('\\')) return cmd;
    const p = envPath || process.env.PATH || '';
    const sep = process.platform === 'win32' ? ';' : ':';
    for (const dir of p.split(sep)) {
      if (!dir) continue;
      const candidate = path.join(dir, cmd);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // continue
      }
    }
    return cmd;
  }

  private parseNodeVersion(raw: string): { major: number; minor: number; patch: number } | null {
    const m = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/);
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
  }

  private isNodeVersionAtLeast(a: { major: number; minor: number; patch: number } | null, b: { major: number; minor: number; patch: number }): boolean {
    if (!a) return false;
    if (a.major !== b.major) return a.major > b.major;
    if (a.minor !== b.minor) return a.minor > b.minor;
    return a.patch >= b.patch;
  }

  private findBestNodeBinary(env: Record<string, string>): string | null {
    const envPath = env.PATH || '';
    const sep = process.platform === 'win32' ? ';' : ':';
    const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';

    let best: { file: string; ver: { major: number; minor: number; patch: number } } | null = null;
    for (const dir of envPath.split(sep)) {
      if (!dir) continue;
      const candidate = path.join(dir, nodeName);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
      } catch {
        continue;
      }
      try {
        const versionRaw = execFileSync(candidate, ['-v'], { encoding: 'utf8', env });
        const ver = this.parseNodeVersion(versionRaw);
        if (!this.isNodeVersionAtLeast(ver, OpenClawGatewayManager.MIN_NODE)) continue;
        if (!best || this.isNodeVersionAtLeast(ver, best.ver)) {
          best = { file: candidate, ver: ver! };
        }
      } catch {
        // Ignore broken node binaries.
      }
    }
    return best?.file ?? null;
  }

  private shouldRunCliViaNode(resolvedCliPath: string): boolean {
    if (/\.(mjs|cjs|js)$/i.test(resolvedCliPath)) return true;
    try {
      const fd = fs.openSync(resolvedCliPath, 'r');
      const buf = Buffer.alloc(128);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const head = buf.slice(0, n).toString('utf8');
      return head.startsWith('#!') && head.includes('node');
    } catch {
      return false;
    }
  }

  /**
   * Type-safe event emitter
   */
  override emit<K extends keyof GatewayManagerEvents>(event: K, ...args: Parameters<GatewayManagerEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  override on<K extends keyof GatewayManagerEvents>(event: K, listener: GatewayManagerEvents[K]): this {
    return super.on(event, listener);
  }

  override once<K extends keyof GatewayManagerEvents>(event: K, listener: GatewayManagerEvents[K]): this {
    return super.once(event, listener);
  }

  /**
   * Start the gateway process
   * Returns the port number when ready
   */
  async start(): Promise<number> {
    // Prevent duplicate starts
    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.process && !this.process.killed) {
      return this.port;
    }

    this.isStarting = true;
    this.startPromise = this.doStart();

    try {
      const port = await this.startPromise;
      return port;
    } finally {
      this.isStarting = false;
      this.startPromise = null;
    }
  }

  private async doStart(): Promise<number> {
    return new Promise((resolve, reject) => {
      const args = ['gateway', '--port', String(this.port)];

      // Use enhanced env with shell variables
      const env = getEnhancedEnv(this.customEnv);

      const isWindows = process.platform === 'win32';

      const resolvedCli = this.resolveCommandPath(this.cliPath, env.PATH);
      const bestNode = this.findBestNodeBinary(env);
      const runViaNode = bestNode && this.shouldRunCliViaNode(resolvedCli);

      const spawnCommand = runViaNode ? bestNode! : resolvedCli;
      const spawnArgs = runViaNode ? [resolvedCli, ...args] : args;

      console.log(`[OpenClawGatewayManager] Starting: ${spawnCommand} ${spawnArgs.join(' ')}`);

      this.process = spawn(spawnCommand, spawnArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: isWindows,
      });

      let hasResolved = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Look for ready signal in stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdoutBuffer += output;
        this.emit('stdout', output);

        // Look for gateway ready signals
        if (!hasResolved && (output.includes('Gateway listening') || output.includes(`port ${this.port}`) || output.includes('WebSocket server started') || output.includes('gateway ready') || output.includes('listening on'))) {
          hasResolved = true;
          console.log(`[OpenClawGatewayManager] Gateway ready on port ${this.port}`);
          this.emit('ready', this.port);
          resolve(this.port);
        }
      });

      // Capture stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderrBuffer += output;
        this.emit('stderr', output);

        // Some CLIs output ready message to stderr
        if (!hasResolved && (output.includes('Gateway listening') || output.includes(`port ${this.port}`) || output.includes('WebSocket server started') || output.includes('gateway ready') || output.includes('listening on'))) {
          hasResolved = true;
          console.log(`[OpenClawGatewayManager] Gateway ready on port ${this.port}`);
          this.emit('ready', this.port);
          resolve(this.port);
        }
      });

      this.process.on('error', (error) => {
        console.error('[OpenClawGatewayManager] Process error:', error);
        if (!hasResolved) {
          reject(error);
        }
        this.emit('error', error);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[OpenClawGatewayManager] Process exited: code=${code}, signal=${signal}`);
        this.emit('exit', { code, signal });
        this.process = null;

        if (!hasResolved) {
          const errorMsg = `Gateway exited with code ${code}.\nStdout: ${stdoutBuffer.slice(-500)}\nStderr: ${stderrBuffer.slice(-500)}`;
          reject(new Error(errorMsg));
        }
      });

      // Timeout fallback - assume ready after 5 seconds if no explicit signal
      // Only resolve if process is still running (not already exited)
      setTimeout(() => {
        if (!hasResolved && this.process && !this.process.killed) {
          hasResolved = true;
          console.log(`[OpenClawGatewayManager] Gateway assumed ready (timeout fallback) on port ${this.port}`);
          this.emit('ready', this.port);
          resolve(this.port);
        }
      }, 5000);
    });
  }

  /**
   * Stop the gateway process
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    console.log('[OpenClawGatewayManager] Stopping gateway...');

    // Send SIGTERM first
    this.process.kill('SIGTERM');

    // Force kill after timeout
    const forceKillTimeout = setTimeout(() => {
      if (this.process && !this.process.killed) {
        console.log('[OpenClawGatewayManager] Force killing gateway...');
        this.process.kill('SIGKILL');
      }
    }, 5000);

    await new Promise<void>((resolve) => {
      if (!this.process) {
        clearTimeout(forceKillTimeout);
        resolve();
        return;
      }

      this.process.once('exit', () => {
        clearTimeout(forceKillTimeout);
        resolve();
      });
    });

    this.process = null;
    console.log('[OpenClawGatewayManager] Gateway stopped');
  }

  /**
   * Check if gateway is running
   */
  get isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Get current port
   */
  get currentPort(): number {
    return this.port;
  }

  /**
   * Get the gateway URL
   */
  get gatewayUrl(): string {
    return `ws://127.0.0.1:${this.port}`;
  }
}
