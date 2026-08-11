import { ipcBridge } from '@/common';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import { useCallback, useMemo } from 'react';
import useSWR, { mutate } from 'swr';

export type AvailableBackend = {
  id: string;
  name: string;
  isExtension?: boolean;
};

/**
 * Provides detected execution engines for backend selectors (e.g. AssistantEditDrawer).
 * Excludes preset assistants — those live in ConfigStorage('assistants').
 *
 * Returns `availableBackends` (simplified shape for Select dropdowns)
 * and `refreshAgentDetection` to trigger a re-scan.
 */
export const useDetectedAgents = () => {
  const { data: rawAgents = [] } = useSWR<AvailableAgent[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  const availableBackends = useMemo<AvailableBackend[]>(
    () =>
      rawAgents
        .filter((a) => !a.isPreset && a.backend !== 'remote')
        .map((a) => ({
          id: a.backend,
          name: a.name,
          isExtension: a.isExtension,
        })),
    [rawAgents]
  );

  const refreshAgentDetection = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate(DETECTED_AGENTS_SWR_KEY);
    } catch {
      // ignore
    }
  }, []);

  return {
    availableBackends,
    refreshAgentDetection,
  };
};
