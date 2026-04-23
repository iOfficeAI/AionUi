/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/config/storage';
import type { AcpBackend, AvailableAgent, EffectiveAgentInfo } from '../types';
import { useCallback } from 'react';

type UseAgentAvailabilityOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  availableAgents: AvailableAgent[] | undefined;
  resolvePresetAgentType: (agentInfo: { backend: AcpBackend; custom_agent_id?: string } | undefined) => string;
};

type UseAgentAvailabilityResult = {
  isMainAgentAvailable: (agent_type: string) => boolean;
  getEffectiveAgentType: (
    agentInfo: { backend: AcpBackend; custom_agent_id?: string } | undefined
  ) => EffectiveAgentInfo;
};

/**
 * Hook that provides agent availability checking logic.
 * Determines whether agents are available and provides fallback resolution.
 */
export const useAgentAvailability = ({
  modelList,
  isGoogleAuth,
  availableAgents,
  resolvePresetAgentType,
}: UseAgentAvailabilityOptions): UseAgentAvailabilityResult => {
  const isMainAgentAvailable = useCallback(
    (agent_type: string): boolean => {
      if (agent_type === 'gemini') {
        return isGoogleAuth || (modelList != null && modelList.length > 0);
      }
      return availableAgents?.some((agent) => agent.backend === agent_type) ?? false;
    },
    [modelList, availableAgents, isGoogleAuth]
  );

  const getEffectiveAgentType = useCallback(
    (agentInfo: { backend: AcpBackend; custom_agent_id?: string } | undefined): EffectiveAgentInfo => {
      const originalType = resolvePresetAgentType(agentInfo);
      const isAvailable = isMainAgentAvailable(originalType);
      return { agent_type: originalType, isFallback: false, originalType, isAvailable };
    },
    [resolvePresetAgentType, isMainAgentAvailable]
  );

  return {
    isMainAgentAvailable,
    getEffectiveAgentType,
  };
};
