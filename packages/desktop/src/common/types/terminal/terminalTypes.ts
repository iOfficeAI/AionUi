/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for the integrated bottom terminal panel.
 *
 * The renderer (xterm.js) drives input/resize through the IPC bridge; the main
 * process (node-pty) is the sole owner of OS-level pseudo-terminal handles.
 */

/** Caller-provided options when opening a new terminal session. */
export type TerminalSpawnOptions = {
  /** Working directory; falls back to user home if omitted or invalid. */
  cwd?: string;
  /** Explicit shell binary; overrides auto-detection when provided. */
  shell?: string;
  /** Initial PTY width in columns. Defaults to 80 if omitted. */
  cols?: number;
  /** Initial PTY height in rows. Defaults to 24 if omitted. */
  rows?: number;
};

/** Result of a successful spawn, returned to the renderer. */
export type TerminalSpawnResult = {
  session_id: string;
  /** Absolute path to the shell that was spawned. */
  shell: string;
  /** Resolved working directory of the spawned session. */
  cwd: string;
  /** Process ID of the spawned shell. */
  pid: number;
};

/** Streaming output chunk for a single session. */
export type TerminalOutputEvent = {
  session_id: string;
  /** Raw bytes from the PTY, decoded as UTF-8. May include ANSI escapes. */
  data: string;
};

/** Why a session was torn down. */
export type TerminalExitReason = 'shell-exit' | 'killed' | 'crashed';

/** Lifecycle event emitted when a PTY terminates. */
export type TerminalExitEvent = {
  session_id: string;
  exit_code: number | null;
  signal: number | null;
  reason: TerminalExitReason;
};

/** Request payload for writing input to a session. */
export type TerminalWriteRequest = {
  session_id: string;
  data: string;
};

/** Request payload for resizing a session. */
export type TerminalResizeRequest = {
  session_id: string;
  cols: number;
  rows: number;
};

/** Request payload for killing a session. */
export type TerminalKillRequest = {
  session_id: string;
};
