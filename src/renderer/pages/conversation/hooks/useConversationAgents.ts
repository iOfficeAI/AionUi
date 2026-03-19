/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import {
  AVAILABLE_AGENTS_SWR_KEY,
  filterAvailableAgentsForUi,
  splitConversationDropdownAgents,
} from '@/renderer/utils/model/availableAgents';

export type UseConversationAgentsResult = {
  /** CLI Agents (non-custom, non-preset backends, excluding gemini-CLI) */
  cliAgents: AvailableAgent[];
  /** Preset assistants (isPreset === true) */
  presetAssistants: AvailableAgent[];
  /** Loading state */
  isLoading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
};

/**
 * Hook to fetch available CLI agents and preset assistants for the conversation tab dropdown.
 * Filters out gemini-CLI agents (BUG-4: matches useGuidAgentSelection filter logic).
 */
export const useConversationAgents = (): UseConversationAgentsResult => {
  const {
    data: availableAgents,
    isLoading,
    mutate,
  } = useSWR(AVAILABLE_AGENTS_SWR_KEY, async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return filterAvailableAgentsForUi(result.data);
    }
    return [];
  });

  const { cliAgents, presetAssistants } = useMemo(() => {
    if (!availableAgents) {
      return { cliAgents: [], presetAssistants: [] };
    }
    return splitConversationDropdownAgents(availableAgents);
  }, [availableAgents]);

  const refresh = async () => {
    await mutate();
  };

  return {
    cliAgents,
    presetAssistants,
    isLoading,
    refresh,
  };
};
