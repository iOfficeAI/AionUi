import { useState, useEffect, useCallback } from 'react';
import { mutate } from 'swr';
import type { IHubAgentItem } from '@/common/types/hub';
import { ipcBridge } from '@/common';
import { DETECTED_AGENTS_SWR_KEY } from '@renderer/utils/model/agentTypes';

export function useHubAgents() {
  const [agents, setAgents] = useState<IHubAgentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const extensionList = await ipcBridge.hub.getExtensionList.invoke();
      if (extensionList) {
        // Filter agents
        const agentExtensions = extensionList.filter((ext: IHubAgentItem) => ext.hubs?.includes('acpAdapters'));
        setAgents(agentExtensions);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();

    // Listen to state changes from backend
    const unsubscribe = ipcBridge.hub.onStateChanged.on((payload) => {
      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.name === payload.name) {
            return {
              ...agent,
              status: payload.status,
              installError: payload.error,
            };
          }
          return agent;
        })
      );

      // After install completes, revalidate agent list so home page & settings reflect new agent
      if (payload.status === 'installed') {
        mutate(DETECTED_AGENTS_SWR_KEY);
        mutate('acp.agents.available.settings');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchAgents]);

  const install = async (name: string) => {
    try {
      await ipcBridge.hub.install.invoke({ name });
    } catch (err) {
      console.error('Install failed:', err);
      // Wait for IPC status update to catch the error and reflect it in UI
    }
  };

  const retryInstall = async (name: string) => {
    try {
      await ipcBridge.hub.retryInstall.invoke({ name });
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  const update = async (name: string) => {
    try {
      await ipcBridge.hub.update.invoke({ name });
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  return {
    agents,
    loading,
    error,
    refresh: fetchAgents,
    install,
    retryInstall,
    update,
  };
}
