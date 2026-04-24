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
 * `agent_type` is the top-level discriminant (acp, aionrs, nanobot, etc.).
 * `backend` is only present when `agent_type === 'acp'` (claude, qwen, codex, …).
 */
export type AvailableAgent = {
  id?: string;
  agent_type: string;
  backend?: string;
  name: string;
  cli_path?: string;
  custom_agent_id?: string;
  is_preset?: boolean;
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
    const agents = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (Array.isArray(agents)) {
      return agents as AvailableAgent[];
    }
  } catch {
    // fallback to empty
  }
  return [];
}
