/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * UI-facing types for the background-process REST surface
 * (`/api/remote-agents/{id}/bg-processes…`). Mirrors AionCore's
 * `aionui-api-types::bg_process` (snake_case wire shapes).
 */

export type BgProcessStatus = 'running' | 'exited' | 'killed';

export type BgProcessUiInfo = {
  id: string;
  name?: string;
  command: string;
  cwd: string;
  session_id: string;
  status: BgProcessStatus;
  exit_code?: number;
  started_at_ms: number;
  ended_at_ms?: number;
  output_bytes: number;
  truncated: boolean;
};

export type BgProcessListResponse = {
  processes: BgProcessUiInfo[];
};

export type BgProcessOutputResponse = {
  output: string;
  next_offset: number;
  process: BgProcessUiInfo;
};

/** `remote.bgProcessChanged` WS broadcast payload. */
export type BgProcessChangedEvent = {
  agent_id: string;
  process: BgProcessUiInfo;
};

/** `remote.workspaceChanged` WS broadcast payload (from `file.watcher.updated`). */
export type RemoteWorkspaceChangedEvent = {
  agent_id: string;
  file?: string;
  event?: string;
};

/** `remote.sessionHealth` WS broadcast payload (from `session.idle` / `session.error`). */
export type RemoteSessionHealthEvent = {
  agent_id: string;
  session_id?: string;
  kind: 'idle' | 'error';
  message?: string;
};
