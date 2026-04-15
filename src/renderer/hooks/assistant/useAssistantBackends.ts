import { ipcBridge } from '@/common';
import { useCallback } from 'react';
import useSWR, { mutate } from 'swr';

export type AvailableBackend = {
  id: string;
  name: string;
  isExtension?: boolean;
};

/**
 * Manages available agent backends detection.
 * Builds a structured list from getAvailableAgents IPC,
 * so both builtin and extension agents come from a single source.
 */
export const useAssistantBackends = () => {
  const { data: availableBackends = [] } = useSWR<AvailableBackend[]>('assistant.availableBackends', async () => {
    try {
      const resp = await ipcBridge.acpConversation.getAvailableAgents.invoke();
      if (resp.success && resp.data) {
        return resp.data
          .filter((a) => a.backend !== 'custom' && a.backend !== 'remote')
          .map((a) => ({
            id: a.backend,
            name: a.name,
            isExtension: a.isExtension,
          }));
      }
    } catch {
      // fallback to empty
    }
    return [];
  });

  const refreshAgentDetection = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
      await mutate('assistant.availableBackends');
    } catch {
      // ignore
    }
  }, []);

  return {
    availableBackends,
    refreshAgentDetection,
  };
};
