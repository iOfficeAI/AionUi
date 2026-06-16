/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAgents } from '@/renderer/hooks/agent/useAgents';
import { getAgentModes, getAgentModesFromHandshake, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { useMemo } from 'react';

/**
 * Resolves the available agent modes for a backend, in the same priority
 * order as `AgentModeSelector`: cached handshake modes → cached config
 * options (`category=mode`) → static `getAgentModes` fallback. Lets the
 * mobile action sheet enumerate modes without re-implementing the lookup.
 */
export const useAgentModesForBackend = (backend?: string): AgentModeOption[] => {
  const { agents } = useAgents();
  const handshakeModes = useMemo(() => {
    if (!backend) return [];
    const agent = agents.find((item) => (item.backend ?? item.agent_type) === backend);
    return getAgentModesFromHandshake(agent);
  }, [agents, backend]);

  return useMemo(() => {
    if (handshakeModes.length > 0) return handshakeModes;
    return getAgentModes(backend);
  }, [handshakeModes, backend]);
};
