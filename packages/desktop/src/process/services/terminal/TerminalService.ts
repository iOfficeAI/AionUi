/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Owns the lifecycle of every pseudo-terminal the renderer asks for.
 *
 * Notes:
 *   - Sessions are 1:1 with `node-pty` IPty instances; the renderer never holds
 *     a handle to OS resources.
 *   - All output is forwarded via an injected `onOutput` callback so this class
 *     stays decoupled from the bridge layer (and therefore testable without
 *     spinning up Electron).
 */

import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { IPty } from '@lydell/node-pty';
import * as pty from '@lydell/node-pty';

import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalSpawnOptions,
  TerminalSpawnResult,
} from '@/common/types/terminal/terminalTypes';
import { buildShellEnv, detectDefaultCwd, detectDefaultShell } from './shellDetection';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MIN_DIM = 1;
const MAX_DIM = 1000;

/** Strongly-typed event surface emitted by the service. */
type TerminalServiceEvents = {
  output: (event: TerminalOutputEvent) => void;
  exit: (event: TerminalExitEvent) => void;
};

export type TerminalServiceDeps = {
  /** Override for node-pty (test injection). */
  spawn?: typeof pty.spawn;
  /** Override for filesystem existence checks (test injection). */
  exists?: (path: string) => boolean;
  /** Override for platform detection (test injection). */
  platform?: NodeJS.Platform;
  /** Override for environment lookup (test injection). */
  env?: NodeJS.ProcessEnv;
};

export class TerminalService extends EventEmitter {
  private readonly sessions = new Map<string, IPty>();
  private readonly spawnImpl: typeof pty.spawn;
  private readonly existsImpl: (path: string) => boolean;
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;

  constructor(deps: TerminalServiceDeps = {}) {
    super();
    this.spawnImpl = deps.spawn ?? pty.spawn;
    this.existsImpl = deps.exists ?? existsSync;
    this.platform = deps.platform ?? process.platform;
    this.env = deps.env ?? process.env;
  }

  /** Strongly-typed `on` overload. */
  override on<K extends keyof TerminalServiceEvents>(event: K, listener: TerminalServiceEvents[K]): this {
    return super.on(event, listener);
  }

  /** Strongly-typed `off` overload. */
  override off<K extends keyof TerminalServiceEvents>(event: K, listener: TerminalServiceEvents[K]): this {
    return super.off(event, listener);
  }

  /** Open a new PTY and return identifying metadata. */
  spawn(options: TerminalSpawnOptions = {}): TerminalSpawnResult {
    const shell =
      options.shell?.trim() || detectDefaultShell({ platform: this.platform, env: this.env, exists: this.existsImpl });

    const requestedCwd = options.cwd?.trim();
    const cwd = requestedCwd && this.existsImpl(requestedCwd) ? requestedCwd : detectDefaultCwd(this.env);

    const cols = clampDim(options.cols ?? DEFAULT_COLS);
    const rows = clampDim(options.rows ?? DEFAULT_ROWS);

    const ptyProcess = this.spawnImpl(shell, [], {
      name: 'xterm-256color',
      cwd,
      cols,
      rows,
      env: buildShellEnv(this.env),
    });

    const sessionId = randomUUID();
    this.sessions.set(sessionId, ptyProcess);

    ptyProcess.onData((data) => {
      this.emit('output', { session_id: sessionId, data });
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.sessions.delete(sessionId);
      this.emit('exit', {
        session_id: sessionId,
        exit_code: typeof exitCode === 'number' ? exitCode : null,
        signal: typeof signal === 'number' ? signal : null,
        reason: 'shell-exit',
      });
    });

    return { session_id: sessionId, shell, cwd, pid: ptyProcess.pid };
  }

  /** Forward keystrokes from the renderer into the PTY. */
  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    try {
      session.write(data);
      return true;
    } catch (error) {
      console.error(`[TerminalService] write failed for ${sessionId}:`, error);
      return false;
    }
  }

  /** Notify the PTY of a new viewport size. */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    try {
      session.resize(clampDim(cols), clampDim(rows));
      return true;
    } catch (error) {
      console.error(`[TerminalService] resize failed for ${sessionId}:`, error);
      return false;
    }
  }

  /** Terminate a single session. */
  kill(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    try {
      session.kill();
    } catch (error) {
      console.error(`[TerminalService] kill failed for ${sessionId}:`, error);
    }
    if (this.sessions.delete(sessionId)) {
      this.emit('exit', {
        session_id: sessionId,
        exit_code: null,
        signal: null,
        reason: 'killed',
      });
    }
    return true;
  }

  /** Terminate every session. Used on app quit. */
  killAll(): void {
    for (const [sessionId, session] of this.sessions) {
      try {
        session.kill();
      } catch (error) {
        console.error(`[TerminalService] killAll: failed to kill ${sessionId}:`, error);
      }
    }
    this.sessions.clear();
  }

  /** Whether a session id is currently live. Mostly for tests. */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Number of live sessions. Mostly for tests. */
  get size(): number {
    return this.sessions.size;
  }
}

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_COLS;
  const intN = Math.round(n);
  if (intN < MIN_DIM) return MIN_DIM;
  if (intN > MAX_DIM) return MAX_DIM;
  return intN;
}

/** Process-wide singleton used by the bridge layer. */
let singleton: TerminalService | null = null;

export function getTerminalService(): TerminalService {
  if (!singleton) {
    singleton = new TerminalService();
  }
  return singleton;
}

export function resetTerminalServiceForTests(): void {
  singleton?.killAll();
  singleton = null;
}
