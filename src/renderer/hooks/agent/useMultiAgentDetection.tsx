/**
 * Hook for detecting multi-agent availability on application startup.
 * Silently probes available ACP agents — no toast notification needed
 * since the AgentPillBar already provides visual feedback.
 */

import { ipcBridge } from '@/common';
import { useEffect } from 'react';

export const useMultiAgentDetection = () => {
  useEffect(() => {
    const checkMultiAgentMode = async () => {
      try {
        const response = await ipcBridge.acpConversation.getAvailableAgents.invoke();
        if (response && response.success && response.data) {
          const acpAgents = response.data.filter(
            (agent: { backend: string; name: string; cliPath?: string }) => agent.backend !== 'gemini'
          );
          // Silently detected — the AgentPillBar on the home page shows the agents.
          void acpAgents;
        }
      } catch (error) {
        console.log('Multi-agent detection failed:', error);
      }
    };

    checkMultiAgentMode().catch((error) => {
      console.error('Multi-agent detection failed:', error);
    });
  }, []);
};
