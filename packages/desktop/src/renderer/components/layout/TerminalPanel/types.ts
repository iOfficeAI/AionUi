/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TerminalSpawnResult } from '@/common/types/terminal/terminalTypes';

/**
 * Renderer-side view of a single terminal session.
 *
 * The `session_id` is assigned by the main process on `spawn`. While we are
 * waiting for that response, sessions live in a pending state with a
 * `client_id` only — this is what powers optimistic tab creation.
 */
export type TerminalSession = {
  /** Stable client-side id. Used as React key. */
  client_id: string;
  /** Server-assigned id; null until `spawn` resolves. */
  session_id: string | null;
  /** Display title in the tab strip. */
  title: string;
  /** Working directory used at spawn time. */
  cwd: string | null;
  /** Shell binary used at spawn time. */
  shell: string | null;
  /** True once the PTY has exited and is no longer accepting input. */
  exited: boolean;
  /** Optional exit code surfaced in the tab tooltip after termination. */
  exit_code: number | null;
};

export type SpawnSuccess = {
  client_id: string;
  result: TerminalSpawnResult;
};
