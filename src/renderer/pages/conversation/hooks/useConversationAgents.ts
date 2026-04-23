/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/assistantTypes';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';

export type UseConversationAgentsResult = {
  /** Detected execution engines (acp, extension, remote, aionrs, gemini, etc.) */
  cliAgents: AvailableAgent[];
  /** Preset assistants from the backend-assembled catalog */
  presetAssistants: AvailableAgent[];
  /** Loading state */
  isLoading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
};

/**
 * Convert a backend Assistant record into an AvailableAgent shape.
 */
function assistantToAvailableAgent(assistant: Assistant): AvailableAgent {
  return {
    backend: assistant.presetAgentType || 'gemini',
    name: assistant.name,
    customAgentId: assistant.id,
    isPreset: true,
    context: assistant.context,
    avatar: assistant.avatar,
    presetAgentType: assistant.presetAgentType,
  };
}

/**
 * Hook to fetch available CLI agents and preset assistants for the conversation tab dropdown.
 *
 * Two independent data sources:
 *   - Execution engines — from AgentRegistry via IPC (agents.detected)
 *   - Preset assistants — from backend `/api/assistants` (merged builtin + user + extension)
 */
export const useConversationAgents = (): UseConversationAgentsResult => {
  // Execution engines from AgentRegistry (shared cache with useDetectedAgents / useGuidAgentSelection)
  const {
    data: cliAgents,
    isLoading: isLoadingAgents,
    mutate,
  } = useSWR<AvailableAgent[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  // Preset assistants from the backend-maintained catalog
  const { data: presetConfigs, isLoading: isLoadingPresets } = useSWR('assistants.presets', async () => {
    try {
      const list = await ipcBridge.assistants.list.invoke();
      return list.filter((assistant) => assistant.enabled !== false);
    } catch (error) {
      console.error('Failed to load assistants for conversation selector:', error);
      return [] as Assistant[];
    }
  });

  const presetAssistants = useMemo(() => (presetConfigs || []).map(assistantToAvailableAgent), [presetConfigs]);

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
