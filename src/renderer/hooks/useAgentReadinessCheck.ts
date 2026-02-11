/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import type { AcpBackendAll } from '@/types/acpTypes';

export type AgentCheckResult = {
  backend: AcpBackendAll;
  name: string;
  available: boolean;
  latency?: number;
  error?: string;
  checking: boolean;
  cliPath?: string;
};

export type AgentReadinessState = {
  // Is the current agent ready to use?
  isReady: boolean;
  // Is the check in progress?
  isChecking: boolean;
  // Error message if not ready
  error?: string;
  // Available alternative agents
  availableAgents: AgentCheckResult[];
  // Best agent recommendation
  bestAgent: AgentCheckResult | null;
  // Check progress (0-100)
  progress: number;
  // Current agent being checked
  currentAgent: AcpBackendAll | null;
};

type UseAgentReadinessCheckOptions = {
  // The backend type to check (for ACP conversations)
  backend?: AcpBackendAll;
  // Conversation type ('gemini' or 'acp')
  conversationType: 'gemini' | 'acp' | 'codex';
  // Whether to auto-check on mount
  autoCheck?: boolean;
  // Callback when a ready agent is found
  onAgentReady?: (agent: AgentCheckResult) => void;
};

const AGENT_NAMES: Partial<Record<AcpBackendAll, string>> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  gemini: 'Gemini',
  qwen: 'Qwen Code',
  iflow: 'iFlow',
  droid: 'Droid',
  goose: 'Goose',
  auggie: 'Auggie',
  kimi: 'Kimi',
};

/**
 * Hook to check if the current agent is ready to use before sending messages.
 * For new users who haven't configured auth/API keys, this will detect the issue
 * and recommend available alternatives.
 */
export function useAgentReadinessCheck(options: UseAgentReadinessCheckOptions) {
  const { backend, conversationType, autoCheck = false, onAgentReady } = options;

  const [state, setState] = useState<AgentReadinessState>({
    isReady: true, // Assume ready until proven otherwise
    isChecking: false,
    availableAgents: [],
    bestAgent: null,
    progress: 0,
    currentAgent: conversationType === 'gemini' ? 'gemini' : (backend as AcpBackendAll) || null,
  });

  // Check the current agent's readiness
  const checkCurrentAgent = useCallback(async (): Promise<boolean> => {
    const agentToCheck = conversationType === 'gemini' ? 'gemini' : backend;
    if (!agentToCheck) return true;

    setState((prev) => ({
      ...prev,
      isChecking: true,
      currentAgent: agentToCheck as AcpBackendAll,
    }));

    try {
      const result = await ipcBridge.acpConversation.checkAgentHealth.invoke({
        backend: agentToCheck,
      });

      if (result.success && result.data?.available) {
        setState((prev) => ({
          ...prev,
          isReady: true,
          isChecking: false,
          error: undefined,
        }));
        return true;
      } else {
        setState((prev) => ({
          ...prev,
          isReady: false,
          isChecking: false,
          error: result.msg || result.data?.error || 'Agent not available',
        }));
        return false;
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isReady: false,
        isChecking: false,
        error: error instanceof Error ? error.message : 'Check failed',
      }));
      return false;
    }
  }, [backend, conversationType]);

  // Find available alternative agents
  const findAlternatives = useCallback(async () => {
    const currentAgentBackend = conversationType === 'gemini' ? 'gemini' : backend;

    setState((prev) => ({
      ...prev,
      isChecking: true,
      progress: 0,
      availableAgents: [],
      bestAgent: null,
    }));

    try {
      const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
      if (!result.success || !result.data) {
        setState((prev) => ({
          ...prev,
          isChecking: false,
        }));
        return;
      }

      // Filter out current agent and custom agents
      const agentsToCheck = result.data
        .filter((agent) => agent.backend !== 'custom' && agent.backend !== currentAgentBackend)
        .map((agent) => ({
          backend: agent.backend as AcpBackendAll,
          name: AGENT_NAMES[agent.backend as AcpBackendAll] || agent.name,
          available: false,
          checking: true,
          cliPath: agent.cliPath,
        }));

      if (agentsToCheck.length === 0) {
        setState((prev) => ({
          ...prev,
          isChecking: false,
          availableAgents: [],
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        availableAgents: agentsToCheck,
      }));

      const total = agentsToCheck.length;
      let completed = 0;
      const results: AgentCheckResult[] = [];

      // Check each agent sequentially, stop as soon as we find the first available one
      let firstAvailableAgent: AgentCheckResult | null = null;

      for (const agent of agentsToCheck) {
        const startTime = Date.now();

        try {
          const healthResult = await ipcBridge.acpConversation.checkAgentHealth.invoke({
            backend: agent.backend,
          });
          const latency = Date.now() - startTime;

          const checkedAgent: AgentCheckResult = {
            ...agent,
            available: healthResult.success === true,
            latency: healthResult.success ? latency : undefined,
            error: healthResult.success ? undefined : healthResult.msg,
            checking: false,
          };

          results.push(checkedAgent);

          // If this is the first available agent, set it as bestAgent immediately
          if (checkedAgent.available && !firstAvailableAgent) {
            firstAvailableAgent = checkedAgent;

            // Update state with bestAgent immediately
            setState((prev) => ({
              ...prev,
              isChecking: false, // Stop checking indicator
              bestAgent: firstAvailableAgent,
              availableAgents: [...results, ...agentsToCheck.slice(completed + 1).map((a) => ({ ...a, checking: false }))],
            }));

            // Trigger callback immediately
            if (onAgentReady) {
              onAgentReady(firstAvailableAgent);
            }

            // Stop checking other agents
            return;
          }
        } catch (error) {
          results.push({
            ...agent,
            available: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            checking: false,
          });
        }

        completed++;
        const progress = Math.round((completed / total) * 100);

        setState((prev) => ({
          ...prev,
          progress,
          availableAgents: [...results, ...agentsToCheck.slice(completed).map((a) => ({ ...a, checking: true }))],
        }));
      }

      // All agents checked, none available
      setState((prev) => ({
        ...prev,
        isChecking: false,
        availableAgents: results,
        bestAgent: null,
      }));
    } catch (error) {
      console.error('Failed to find alternatives:', error);
      setState((prev) => ({
        ...prev,
        isChecking: false,
      }));
    }
  }, [backend, conversationType, onAgentReady]);

  // Full check: current agent + alternatives if needed
  const performFullCheck = useCallback(async () => {
    const isCurrentReady = await checkCurrentAgent();
    if (!isCurrentReady) {
      await findAlternatives();
    }
  }, [checkCurrentAgent, findAlternatives]);

  // Reset state
  const reset = useCallback(() => {
    setState({
      isReady: true,
      isChecking: false,
      availableAgents: [],
      bestAgent: null,
      progress: 0,
      currentAgent: conversationType === 'gemini' ? 'gemini' : (backend as AcpBackendAll) || null,
    });
  }, [backend, conversationType]);

  // Auto-check on mount if enabled
  useEffect(() => {
    if (autoCheck) {
      void performFullCheck();
    }
  }, [autoCheck, performFullCheck]);

  return {
    ...state,
    checkCurrentAgent,
    findAlternatives,
    performFullCheck,
    reset,
  };
}

export default useAgentReadinessCheck;
