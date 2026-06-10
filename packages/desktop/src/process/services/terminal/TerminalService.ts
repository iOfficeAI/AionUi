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
 *   - Output is coalesced (batched) per session to keep flood scenarios cheap:
 *     a timer arms on the first chunk and flushes the accumulated buffer as a
 *     single `output` event; size-bound flushes also fire immediately when the
 *     buffer crosses `OUTPUT_FLUSH_BYTES`. The wire shape `{session_id, data}`
 *     is unchanged — coalescing just concatenates `data` strings.
 *   - Each session retains a bounded ring buffer of the most recent output
 *     (`RING_BUFFER_BYTES`) so a renderer that reloads (or attaches late) can
 *     recover the visible scrollback via `snapshot()`.
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
  TerminalSessionInfo,
  TerminalSpawnOptions,
  TerminalSpawnResult,
} from '@/common/types/terminal/terminalTypes';
import { buildShellEnv, detectDefaultCwd, detectDefaultShell } from './shellDetection';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MIN_DIM = 1;
const MAX_DIM = 1000;

/** Coalesce window: a flush fires no later than this many ms after the first chunk. */
const OUTPUT_FLUSH_MS = 8;
/** Coalesce size: flush immediately when the pending buffer crosses this many bytes. */
const OUTPUT_FLUSH_BYTES = 64 * 1024;
/** Per-session ring buffer cap (recent output retained for renderer re-attach). */
const RING_BUFFER_BYTES = 512 * 1024;

/** Per-session state owned by the service. */
type SessionState = {
  pty: IPty;
  shell: string;
  cwd: string;
  pid: number;
  /** Chunks accumulated since the last flush. Empty between flushes. */
  pending: string;
  /** Timer handle for the size-bounded flush. `null` when no flush is armed. */
  flushTimer: ReturnType<typeof setTimeout> | null;
  /** Bounded tail of all flushed output for renderer re-attach. */
  ringBuffer: string;
};

/** Strongly-typed event surface emitted by the service. */
type TerminalServiceEvents = {
  output: (event: TerminalOutputEvent) => void;
  exit: (event: TerminalExitEvent) => void;
};

type TimerScheduler = {
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
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
  /**
   * Override for the timer scheduler. Defaults to `setTimeout`/`clearTimeout`.
   * Tests can inject a fake scheduler (paired with `vi.useFakeTimers()`) to
   * exercise the coalescing window deterministically.
   */
  scheduler?: TimerScheduler;
};

const defaultScheduler: TimerScheduler = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class TerminalService extends EventEmitter {
  private readonly sessions = new Map<string, SessionState>();
  private readonly spawnImpl: typeof pty.spawn;
  private readonly existsImpl: (path: string) => boolean;
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly scheduler: TimerScheduler;

  constructor(deps: TerminalServiceDeps = {}) {
    super();
    this.spawnImpl = deps.spawn ?? pty.spawn;
    this.existsImpl = deps.exists ?? existsSync;
    this.platform = deps.platform ?? process.platform;
    this.env = deps.env ?? process.env;
    this.scheduler = deps.scheduler ?? defaultScheduler;
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
    const state: SessionState = {
      pty: ptyProcess,
      shell,
      cwd,
      pid: ptyProcess.pid,
      pending: '',
      flushTimer: null,
      ringBuffer: '',
    };
    this.sessions.set(sessionId, state);

    ptyProcess.onData((data) => {
      this.handleData(sessionId, data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      // Flush any pending chunks so the renderer sees the tail of output
      // *before* the exit event.
      this.flushSession(sessionId);
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
      session.pty.write(data);
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
      session.pty.resize(clampDim(cols), clampDim(rows));
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
      session.pty.kill();
    } catch (error) {
      console.error(`[TerminalService] kill failed for ${sessionId}:`, error);
    }
    // Flush any pending chunks before the exit event so no output is lost.
    this.flushSession(sessionId);
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
        session.pty.kill();
      } catch (error) {
        console.error(`[TerminalService] killAll: failed to kill ${sessionId}:`, error);
      }
      this.clearSessionTimer(session);
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

  /**
   * List every live session. Used by the renderer to re-attach after a
   * reload — PTYs keep running in the main process so a refreshed renderer
   * can recover their metadata and recent scrollback via `snapshot()`.
   */
  list(): TerminalSessionInfo[] {
    const out: TerminalSessionInfo[] = [];
    for (const [session_id, state] of this.sessions) {
      out.push({
        session_id,
        shell: state.shell,
        cwd: state.cwd,
        pid: state.pid,
      });
    }
    return out;
  }

  /**
   * Return the session's bounded ring buffer (most recent output). `null`
   * for unknown session ids so the caller can distinguish "no session" from
   * "session with empty output".
   */
  snapshot(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.ringBuffer;
  }

  // ---------------------------------------------------------------------------
  // Coalescing internals
  // ---------------------------------------------------------------------------

  private handleData(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pending += data;
    // Size-bounded flush: don't let a sustained flood keep the timer
    // re-arming forever.
    if (session.pending.length >= OUTPUT_FLUSH_BYTES) {
      this.flushSession(sessionId);
      return;
    }
    if (session.flushTimer === null) {
      session.flushTimer = this.scheduler.setTimeout(() => {
        this.flushSession(sessionId);
      }, OUTPUT_FLUSH_MS);
    }
  }

  /** Emit a single coalesced `output` event and update the ring buffer. */
  private flushSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.clearSessionTimer(session);
    if (session.pending.length === 0) return;
    const data = session.pending;
    session.pending = '';
    this.appendToRingBuffer(session, data);
    this.emit('output', { session_id: sessionId, data });
  }

  /** Append `chunk` to the ring buffer, trimming the head to stay under the cap. */
  private appendToRingBuffer(session: SessionState, chunk: string): void {
    if (RING_BUFFER_BYTES <= 0) return;
    session.ringBuffer += chunk;
    if (session.ringBuffer.length > RING_BUFFER_BYTES) {
      // Trim from the front, snapping to the nearest character boundary so we
      // never leave a partial code point in the buffer (terminal output is
      // UTF-8 and may contain multi-byte sequences).
      const overflow = session.ringBuffer.length - RING_BUFFER_BYTES;
      let trimAt = overflow;
      // Walk forward until we land on a non-continuation byte (0x80-0xBF).
      while (trimAt < session.ringBuffer.length && (session.ringBuffer.charCodeAt(trimAt) & 0xc0) === 0x80) {
        trimAt += 1;
      }
      session.ringBuffer = session.ringBuffer.slice(trimAt);
    }
  }

  private clearSessionTimer(session: SessionState): void {
    if (session.flushTimer !== null) {
      this.scheduler.clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
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
