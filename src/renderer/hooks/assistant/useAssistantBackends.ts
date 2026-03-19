import { ipcBridge } from '@/common';
import { useCallback, useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';

/**
 * Manages available agent backends detection and
 * extension-contributed ACP adapters.
 */
export const useAssistantBackends = () => {
  const [availableBackends, setAvailableBackends] = useState<Set<string>>(new Set(['gemini']));

  // Load extension-contributed ACP adapters so they appear in the main agent dropdown
  const { data: extensionAcpAdapters } = useSWR('extensions.acpAdapters', () =>
    ipcBridge.extensions.getAcpAdapters.invoke().catch(() => [] as Record<string, unknown>[])
  );

  // Load available agent backends from ACP detector
  useEffect(() => {
    void (async () => {
      try {
        const resp = await ipcBridge.acpConversation.getAvailableAgents.invoke();
        if (resp.success && resp.data) {
          setAvailableBackends(new Set(resp.data.map((a) => a.backend)));
        }
      } catch {
        // fallback to default
      }
    })();
  }, []);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch {
      // ignore
    }
  }, []);

  return {
    availableBackends,
    extensionAcpAdapters,
    refreshAgentDetection,
  };
};
