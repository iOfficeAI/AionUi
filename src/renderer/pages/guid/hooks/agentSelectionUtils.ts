/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import type { AcpBackend } from '../types';

/** Save preferred mode to the agent's own config key */
export async function savePreferredMode(agentKey: string, mode: string): Promise<void> {
  try {
    if (agentKey === 'gemini') {
      const config = await ConfigStorage.get('gemini.config');
      await ConfigStorage.set('gemini.config', { ...config, preferredMode: mode });
    } else if (agentKey === 'aionrs') {
      const config = await ConfigStorage.get('aionrs.config');
      await ConfigStorage.set('aionrs.config', { ...config, preferredMode: mode });
    } else if (agentKey !== 'custom') {
      const config = await ConfigStorage.get('acp.config');
      const backendConfig = config?.[agentKey as AcpBackendAll] || {};
      await ConfigStorage.set('acp.config', { ...config, [agentKey]: { ...backendConfig, preferredMode: mode } });
    }
  } catch {
    /* silent */
  }
}

/** Save preferred model ID to the agent's acp.config key */
export async function savePreferredModelId(agentKey: string, modelId: string): Promise<void> {
  try {
    const config = await ConfigStorage.get('acp.config');
    const backendConfig = config?.[agentKey as AcpBackendAll] || {};
    await ConfigStorage.set('acp.config', { ...config, [agentKey]: { ...backendConfig, preferredModelId: modelId } });
  } catch {
    /* silent */
  }
}

/**
 * Get agent key for selection.
 * Returns "custom:uuid" for custom agents, "remote:uuid" for remote agents, backend type for others.
 */
export const getAgentKey = (agent: { backend: AcpBackend; customAgentId?: string; isPreset?: boolean }): string => {
  if (agent.backend === 'remote' && agent.customAgentId) return `remote:${agent.customAgentId}`;
  if (agent.customAgentId) return `custom:${agent.customAgentId}`;
  return agent.backend;
};
