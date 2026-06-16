/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import useSWR, { mutate } from 'swr';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import { isSupportedNewConversationAgent } from '@/renderer/utils/model/agentTypeSupportPolicy';

export type UseRuntimeAgentsCatalogResult = {
  cliAgents: AgentMetadata[];
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export const useRuntimeAgentsCatalog = (): UseRuntimeAgentsCatalogResult => {
  const { data: cliAgents, isLoading } = useSWR<AgentMetadata[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  return {
    cliAgents: (cliAgents ?? []).filter(isSupportedNewConversationAgent),
    isLoading,
    refresh: async () => {
      await mutate(DETECTED_AGENTS_SWR_KEY);
    },
  };
};
