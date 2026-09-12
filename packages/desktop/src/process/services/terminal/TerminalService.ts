/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn as spawnChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  TerminalCreateOptions,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalProcessInstance,
  TerminalSessionInfo,
} from './types';

export class TerminalService {
  private sessions = new Map<string, TerminalProcessInstance>();
  private onDataCallback: ((event: TerminalDataEvent) => void) | null = null;
  private onExitCallback: ((event: TerminalExitEvent) => void) | null = null;

  public setCallbacks(callbacks: {
    onData: (event: TerminalDataEvent) => void;
    onExit: (event: TerminalExitEvent) => void;
  }): void {
    this.onDataCallback = callbacks.onData;
    this.onExitCallback = callbacks.onExit;
  }

  public getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'powershell.exe';
    }
    return process.env.SHELL || '/bin/zsh';
  }

  public resolveCwd(requestedCwd?: string): string {
    if (requestedCwd && typeof requestedCwd === 'string') {
      const trimmed = requestedCwd.trim();
      if (trimmed.length > 0) {
        try {
          if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) {
            return path.resolve(trimmed);
          }
        } catch {
          // fall through to home dir
        }
      }
    }
    return os.homedir() || process.cwd();
  }

  public createSession(options: TerminalCreateOptions): TerminalSessionInfo {
    const { id, cwd, cols = 80, rows = 24, shell = this.getDefaultShell() } = options;

    // If session already exists, return its info
    const existing = this.sessions.get(id);
    if (existing) {
      return {
        id,
        shell: existing.shell,
        cwd: existing.cwd,
      };
    }

    const resolvedCwd = this.resolveCwd(cwd);
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    let session: TerminalProcessInstance;

    // Attempt to use node-pty if available
    let ptyModule: typeof import('node-pty') | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ptyModule = require('node-pty');
    } catch {
      ptyModule = null;
    }

    if (ptyModule && typeof ptyModule.spawn === 'function') {
      try {
        const ptyProcess = ptyModule.spawn(shell, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: resolvedCwd,
          env,
        });

        ptyProcess.onData((data: string) => {
          this.onDataCallback?.({ id, data });
        });

        ptyProcess.onExit(({ exitCode, signal }) => {
          this.sessions.delete(id);
          this.onExitCallback?.({ id, exitCode, signal });
        });

        session = {
          write: (data: string) => {
            try {
              ptyProcess.write(data);
            } catch (err) {
              console.warn(`[TerminalService] Error writing to pty (${id}):`, err);
            }
          },
          resize: (c: number, r: number) => {
            try {
              ptyProcess.resize(c, r);
            } catch (err) {
              console.warn(`[TerminalService] Error resizing pty (${id}):`, err);
            }
          },
          kill: () => {
            try {
              ptyProcess.kill();
            } catch {
              // ignore
            }
          },
          cwd: resolvedCwd,
          shell,
        };
      } catch (e) {
        console.warn('[TerminalService] Failed to spawn node-pty, falling back to child_process:', e);
        session = this.spawnFallbackProcess(id, shell, resolvedCwd, env);
      }
    } else {
      session = this.spawnFallbackProcess(id, shell, resolvedCwd, env);
    }

    this.sessions.set(id, session);

    return {
      id,
      shell,
      cwd: resolvedCwd,
    };
  }

  private spawnFallbackProcess(
    id: string,
    shell: string,
    cwd: string,
    env: Record<string, string | undefined>
  ): TerminalProcessInstance {
    const isWin = process.platform === 'win32';
    const child = spawnChildProcess(shell, isWin ? [] : ['-i'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (buf: Buffer) => {
      this.onDataCallback?.({ id, data: buf.toString('utf-8') });
    });

    child.stderr?.on('data', (buf: Buffer) => {
      this.onDataCallback?.({ id, data: buf.toString('utf-8') });
    });

    child.on('close', (code, signal) => {
      this.sessions.delete(id);
      this.onExitCallback?.({
        id,
        exitCode: code ?? 0,
        signal: signal ? 1 : undefined,
      });
    });

    return {
      write: (data: string) => {
        try {
          child.stdin?.write(data);
        } catch (err) {
          console.warn(`[TerminalService] Error writing to child_process (${id}):`, err);
        }
      },
      kill: () => {
        try {
          child.kill();
        } catch {
          // ignore
        }
      },
      cwd,
      shell,
    };
  }

  public write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      console.warn(`[TerminalService] Session ${id} not found for write`);
      return;
    }
    session.write(data);
  }

  public resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.resize?.(cols, rows);
  }

  public kill(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.kill();
    this.sessions.delete(id);
  }

  public getSession(id: string): TerminalSessionInfo | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    return {
      id,
      shell: session.shell,
      cwd: session.cwd,
    };
  }

  public hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  public closeAll(): void {
    for (const [id, session] of this.sessions.entries()) {
      try {
        session.kill();
      } catch {
        // ignore
      }
      this.sessions.delete(id);
    }
  }
}

export const terminalService = new TerminalService();
