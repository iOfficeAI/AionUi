/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

/** SWR key for detected execution engines (from AgentRegistry). */
export const DETECTED_AGENTS_SWR_KEY = 'agents.detected';

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

/** Shared fetcher for DETECTED_AGENTS_SWR_KEY — single source of truth. */
export async function fetchDetectedAgents(): Promise<AvailableAgent[]> {
  try {
    const resp = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (resp.success && resp.data) {
      return resp.data as AvailableAgent[];
    }
  } catch {
    // fallback to empty
  }
  return [];
}
