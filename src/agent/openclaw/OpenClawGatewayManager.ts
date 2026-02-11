/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { getEnhancedEnv } from '@/agent/acp/AcpConnection';

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

  constructor(config: GatewayManagerConfig = {}) {
    super();
    this.cliPath = config.cliPath || 'openclaw';
    this.port = config.port || 18789;
    this.customEnv = config.customEnv;
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

      console.log(`[OpenClawGatewayManager] Starting: ${this.cliPath} ${args.join(' ')}`);

      this.process = spawn(this.cliPath, args, {
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
