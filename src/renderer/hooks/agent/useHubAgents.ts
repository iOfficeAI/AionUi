import { useState, useEffect, useCallback } from 'react';
import { mutate } from 'swr';
import type { IHubAgentItem } from '@/common/types/hub';
import { ipcBridge } from '@/common';
import { AVAILABLE_AGENTS_SWR_KEY } from '@renderer/utils/model/availableAgents';

export function useHubAgents() {
  const [agents, setAgents] = useState<IHubAgentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await ipcBridge.hub.getExtensionList.invoke();
      if (response.success && response.data) {
        // Filter agents
        const agentExtensions = response.data.filter((ext: IHubAgentItem) => ext.hubs?.includes('acpAdapters'));
        setAgents(agentExtensions);
      } else {
        setError(response.msg || 'Failed to fetch hub extensions');
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
        mutate(AVAILABLE_AGENTS_SWR_KEY);
        mutate('acp.agents.available.settings');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchAgents]);

  const install = async (name: string) => {
    try {
      const res = await ipcBridge.hub.install.invoke({ name });
      if (!res.success) {
        throw new Error(res.msg || 'Installation failed');
      }
    } catch (err) {
      console.error('Install failed:', err);
      // Wait for IPC status update to catch the error and reflect it in UI
    }
  };

  const retryInstall = async (name: string) => {
    try {
      const res = await ipcBridge.hub.retryInstall.invoke({ name });
      if (!res.success) {
        throw new Error(res.msg || 'Retry installation failed');
      }
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  const update = async (name: string) => {
    try {
      const res = await ipcBridge.hub.update.invoke({ name });
      if (!res.success) {
        throw new Error(res.msg || 'Update failed');
      }
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
