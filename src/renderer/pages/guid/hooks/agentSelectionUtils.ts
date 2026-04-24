/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import type { AcpBackend } from '../types';

/** Save preferred mode to the agent's own config key */
export async function savePreferredMode(agentKey: string, mode: string): Promise<void> {
  try {
    if (agentKey === 'gemini') {
      const config = configService.get('gemini.config');
      await configService.set('gemini.config', { ...config, preferredMode: mode });
    } else if (agentKey === 'aionrs') {
      const config = configService.get('aionrs.config');
      await configService.set('aionrs.config', { ...config, preferredMode: mode });
    } else if (agentKey !== 'custom') {
      const config = configService.get('acp.config');
      const backendConfig = config?.[agentKey as AcpBackendAll] || {};
      await configService.set('acp.config', { ...config, [agentKey]: { ...backendConfig, preferredMode: mode } });
    }
  } catch {
    /* silent */
  }
}

/** Save preferred model ID to the agent's acp.config key */
export async function savePreferredModelId(agentKey: string, model_id: string): Promise<void> {
  try {
    const config = configService.get('acp.config');
    const backendConfig = config?.[agentKey as AcpBackendAll] || {};
    await configService.set('acp.config', { ...config, [agentKey]: { ...backendConfig, preferredModelId: model_id } });
  } catch {
    /* silent */
  }
}

/**
 * Get agent key for selection.
 * Uses agent_type as the primary discriminant; backend is only meaningful for ACP agents.
 * Returns "custom:uuid" for custom agents, "remote:uuid" for remote agents,
 * backend (if present) or agent_type for others.
 */
export const getAgentKey = (agent: {
  agent_type: string;
  backend?: string;
  custom_agent_id?: string;
  is_preset?: boolean;
}): string => {
  if (agent.agent_type === 'remote' && agent.custom_agent_id) return `remote:${agent.custom_agent_id}`;
  if (agent.custom_agent_id) return `custom:${agent.custom_agent_id}`;
  return agent.backend || agent.agent_type;
};
