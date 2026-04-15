/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const AVAILABLE_AGENTS_SWR_KEY = 'acp.agents.available';

/**
 * Available agent entry returned by the backend.
 * `backend` is typed as `string` because the IPC layer returns plain strings
 * and the superset includes non-ACP values like `'remote'` and `'aionrs'`.
 */
export type AvailableAgent = {
  backend: string;
  name: string;
  cliPath?: string;
  customAgentId?: string;
  isPreset?: boolean;
  context?: string;
  avatar?: string;
  presetAgentType?: string;
  supportedTransports?: string[];
  isExtension?: boolean;
  extensionName?: string;
};
