/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Live status of a local OpenCode instance. */
export type LocalOpenCodeStatus = 'starting' | 'running' | 'stopped' | 'crashed';

/** A managed local OpenCode instance. */
export type LocalOpenCodeInstance = {
  id: string;
  name: string;
  port: number;
  status: LocalOpenCodeStatus;
  pid: number | null;
  /** The remote_agent_id this instance was registered as. */
  agent_id: string;
  working_dir: string;
  created_at: number;
};

/** Request to start a local OpenCode instance. */
export type StartLocalOpenCodeRequest = {
  name?: string;
  working_dir?: string;
};

/** Response for the list endpoint. */
export type LocalOpenCodeListResponse = {
  instances: LocalOpenCodeInstance[];
};
