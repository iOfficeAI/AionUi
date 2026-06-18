import { ipcBridge } from '@/common';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import { useCallback, useMemo } from 'react';
import useSWR, { mutate } from 'swr';

export type AvailableBackendModelOption = {
  value: string;
  label: string;
};

export type AvailableBackend = {
  id: string;
  name: string;
  isExtension?: boolean;
  modelOptions: AvailableBackendModelOption[];
};

const resolveBackendModelOptions = (agent: AgentMetadata): AvailableBackendModelOption[] => {
  const handshakeModels = agent.handshake?.available_models as AcpModelInfo | undefined;
  if (
    handshakeModels &&
    Array.isArray(handshakeModels.available_models) &&
    handshakeModels.available_models.length > 0
  ) {
    return handshakeModels.available_models.map((model) => ({
      value: model.id,
      label: model.label || model.id,
    }));
  }

  const backend = agent.backend || agent.agent_type;
  if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
    return DEFAULT_CODEX_MODELS.map((model) => ({
      value: model.id,
      label: model.label,
    }));
  }

  return [];
};

/**
 * Provides detected execution engines for assistant editor backend selectors.
 * Excludes preset assistants — those live in the backend catalog
 * (`ipcBridge.assistants.list`).
 *
 * Returns `availableBackends` (simplified shape for Select dropdowns)
 * and `refreshAgentDetection` to trigger a re-scan.
 */
export const useDetectedAgents = () => {
  const { data: rawAgents = [] } = useSWR<AgentMetadata[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  const availableBackends = useMemo<AvailableBackend[]>(
    () =>
      rawAgents
        .filter((a) => a.agent_type !== 'remote')
        .map((a) => ({
          // `preset_agent_type` stores the backend slug (e.g. "claude", "gemini"),
          // not the AgentMetadata row id. Align the Select value with that contract.
          id: a.backend || a.agent_type,
          name: a.name,
          isExtension: a.agent_source === 'extension',
          modelOptions: resolveBackendModelOptions(a),
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
