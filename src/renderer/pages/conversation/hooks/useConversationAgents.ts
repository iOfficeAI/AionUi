/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';

export type UseConversationAgentsResult = {
  /** Detected execution engines (acp, extension, remote, aionrs, gemini, etc.) */
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
    backend: config.presetAgentType || 'gemini',
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
 * Two independent data sources:
 *   - Execution engines — from AgentRegistry via IPC (agents.detected)
 *   - Preset assistants — from ConfigStorage ('assistants')
 */
export const useConversationAgents = (): UseConversationAgentsResult => {
  // Execution engines from AgentRegistry (shared cache with useDetectedAgents / useGuidAgentSelection)
  const {
    data: cliAgents,
    isLoading: isLoadingAgents,
    mutate,
  } = useSWR<AvailableAgent[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  // Preset assistants from config layer
  const { data: presetConfigs, isLoading: isLoadingPresets } = useSWR('assistants.presets', async () => {
    const agents: AcpBackendConfig[] = (await ConfigStorage.get('assistants')) || [];
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
