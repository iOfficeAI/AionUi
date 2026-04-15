/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { AVAILABLE_AGENTS_SWR_KEY } from '@/renderer/utils/model/agentTypes';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';

export type UseConversationAgentsResult = {
  /** CLI Agents (execution engines, excluding gemini-CLI) */
  cliAgents: AvailableAgent[];
  /** Preset assistants from config layer */
  presetAssistants: AvailableAgent[];
  /** Loading state */
  isLoading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
};

/**
 * Convert a preset assistant config into an AvailableAgent shape.
 */
function configToAvailableAgent(config: AcpBackendConfig): AvailableAgent {
  return {
    backend: 'custom',
    name: config.name,
    customAgentId: config.id,
    isPreset: true,
    context: config.context,
    avatar: config.avatar,
    presetAgentType: config.presetAgentType,
  };
}

/**
 * Hook to fetch available CLI agents and preset assistants for the conversation tab dropdown.
 *
 * Two independent data sources (no longer mixed):
 *   - Execution engines — from AgentRegistry via IPC (getAvailableAgents)
 *   - Preset assistants — from ConfigStorage (acp.customAgents)
 */
export const useConversationAgents = (): UseConversationAgentsResult => {
  // Execution engines from AgentRegistry
  const {
    data: cliAgents,
    isLoading: isLoadingAgents,
    mutate,
  } = useSWR(AVAILABLE_AGENTS_SWR_KEY, async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return result.data;
    }
    return [];
  });

  // Preset assistants from config layer
  const { data: presetConfigs, isLoading: isLoadingPresets } = useSWR('acp.customAgents.presets', async () => {
    const agents: AcpBackendConfig[] = (await ConfigStorage.get('acp.customAgents')) || [];
    return agents.filter((a) => a.isPreset && a.enabled !== false);
  });

  const presetAssistants = useMemo(() => (presetConfigs || []).map(configToAvailableAgent), [presetConfigs]);

  const refresh = async () => {
    await mutate();
  };

  return {
    cliAgents: cliAgents || [],
    presetAssistants,
    isLoading: isLoadingAgents || isLoadingPresets,
    refresh,
  };
};
