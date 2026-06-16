/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { CODEX_MODE_NATIVE_FULL_ACCESS, normalizeCodexMode } from '@/common/types/codex/codexModes';
import type { IProvider } from '@/common/config/storage';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { configService } from '@/common/config/configService';
import type { AcpSessionModes } from '@/common/types/platform/acpTypes';
import type { AcpModelInfo } from '../types';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { useAgents } from '@/renderer/hooks/agent/useAgents';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { savePreferredMode, savePreferredModelId } from './agentSelectionUtils';
import { useCustomAgentsLoader } from './useCustomAgentsLoader';

export type GuidAgentSelectionResult = {
  selectedAssistantId: string | null;
  setSelectedAssistantId: (assistantId: string) => void;
  defaultAssistantId: string | null;
  selectedAssistant: Assistant | undefined;
  selectedAssistantBackend: string;
  selectedAssistantAvailable: boolean;
  assistants: Assistant[];
  selectedMode: string;
  setSelectedMode: (mode: React.SetStateAction<string>, options?: { persistPreference?: boolean }) => void;
  selectedAcpModel: string | null;
  setSelectedAcpModel: (model: React.SetStateAction<string | null>, options?: { persistPreference?: boolean }) => void;
  currentAcpCachedModelInfo: AcpModelInfo | null;
};

function resolveDefaultMode(backend: string | undefined, agents: AgentMetadata[] | undefined): string {
  if (!backend) return 'default';

  const matched = agents?.find((a) => (a.backend ?? a.agent_type) === backend);
  const handshakeModes = matched?.handshake?.available_modes as AcpSessionModes | undefined;
  if (handshakeModes) {
    if (handshakeModes.current_mode_id) return handshakeModes.current_mode_id;
    const first = handshakeModes.available_modes?.[0]?.id;
    if (first) return first;
  }

  const staticModes = getAgentModes(backend);
  if (staticModes.length > 0) return staticModes[0].value;

  return 'default';
}

export function resolveAssistantSelectionKey(
  savedKey: string | undefined,
  assistants: Assistant[]
): string | undefined {
  if (!savedKey) return undefined;

  if (savedKey.startsWith('custom:')) {
    const assistantId = savedKey.slice(7);
    return assistants.some((assistant) => assistant.id === assistantId) ? assistantId : undefined;
  }

  if (assistants.some((assistant) => assistant.id === savedKey)) {
    return savedKey;
  }

  const backendMatch = assistants.find((assistant) => assistant.preset_agent_type === savedKey);
  return backendMatch?.id;
}

export function pickDefaultAssistantSelectionKey(assistants: Assistant[]): string {
  const enabledAssistants = assistants.filter((assistant) => assistant.enabled !== false);
  const preferred =
    enabledAssistants.find((assistant) => assistant.source === 'bare' && assistant.preset_agent_type === 'aionrs') ??
    enabledAssistants.find((assistant) => assistant.preset_agent_type === 'aionrs') ??
    enabledAssistants[0];
  return preferred?.id ?? 'aionrs';
}

type UseGuidAgentSelectionOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  resetAssistant?: boolean;
  preselectAgentKey?: string;
  locationKey?: string;
};

export const useGuidAgentSelection = ({
  modelList,
  isGoogleAuth,
  resetAssistant,
  preselectAgentKey,
  locationKey,
}: UseGuidAgentSelectionOptions): GuidAgentSelectionResult => {
  const [selectedAssistantIdState, _setSelectedAssistantId] = useState<string>(() => {
    try {
      return configService.get('guid.lastSelectedAgent') || '';
    } catch {
      return '';
    }
  });
  const [selectedMode, _setSelectedMode] = useState<string>('default');
  const [selectedAcpModel, _setSelectedAcpModel] = useState<string | null>(null);
  const selectedBackendRef = useRef<string | null>(null);
  const { agents } = useAgents();

  const availableCustomAgentIds = useMemo(() => {
    const ids = new Set<string>();
    agents.forEach((agent) => {
      if (agent.agent_source === 'custom' && agent.id) {
        ids.add(agent.id);
      } else if (agent.custom_agent_id) {
        ids.add(agent.custom_agent_id);
      }
    });
    return ids;
  }, [agents]);

  const { assistants } = useCustomAgentsLoader({ availableCustomAgentIds });

  const setSelectedMode = useCallback(
    (mode: React.SetStateAction<string>, options?: { persistPreference?: boolean }) => {
      _setSelectedMode((prev) => {
        const nextMode = typeof mode === 'function' ? mode(prev) : mode;
        const backend = selectedBackendRef.current;
        if (backend && options?.persistPreference !== false) {
          void savePreferredMode(backend, nextMode);
        }
        return nextMode;
      });
    },
    []
  );

  const setSelectedAcpModel = useCallback(
    (modelId: React.SetStateAction<string | null>, options?: { persistPreference?: boolean }) => {
      _setSelectedAcpModel((prev) => {
        const nextModelId = typeof modelId === 'function' ? modelId(prev) : modelId;
        const backend = selectedBackendRef.current;
        if (backend && backend !== 'gemini' && nextModelId && options?.persistPreference !== false) {
          void savePreferredModelId(backend, nextModelId);
        }
        return nextModelId;
      });
    },
    []
  );

  const setSelectedAssistantId = useCallback(
    (assistantId: string) => {
      const normalizedId = resolveAssistantSelectionKey(assistantId, assistants) ?? assistantId;
      _setSelectedAssistantId(normalizedId);
      configService.set('guid.lastSelectedAgent', normalizedId).catch((error) => {
        console.error('Failed to save selected assistant:', error);
      });
    },
    [assistants]
  );

  const resetHandledRef = useRef(false);
  const prevLocationKeyRef = useRef(locationKey);
  if (locationKey !== prevLocationKeyRef.current) {
    prevLocationKeyRef.current = locationKey;
    resetHandledRef.current = false;
  }

  useLayoutEffect(() => {
    if (assistants.length === 0) return;
    if (resetHandledRef.current) return;

    if (preselectAgentKey) {
      const resolvedPreselect = resolveAssistantSelectionKey(preselectAgentKey, assistants);
      if (resolvedPreselect) {
        resetHandledRef.current = true;
        _setSelectedAssistantId(resolvedPreselect);
        configService.set('guid.lastSelectedAgent', resolvedPreselect).catch((error) => {
          console.error('Failed to save preselected assistant:', error);
        });
        return;
      }
    }

    if (resetAssistant) {
      resetHandledRef.current = true;
      const fallbackId = pickDefaultAssistantSelectionKey(assistants);
      _setSelectedAssistantId(fallbackId);
      configService.set('guid.lastSelectedAgent', fallbackId).catch((error) => {
        console.error('Failed to save reset assistant:', error);
      });
    }
  }, [assistants, preselectAgentKey, resetAssistant]);

  useEffect(() => {
    if (assistants.length === 0) return;
    if (resetAssistant) return;
    if (preselectAgentKey && resolveAssistantSelectionKey(preselectAgentKey, assistants)) return;

    let cancelled = false;

    const restoreSavedSelection = async () => {
      try {
        const savedKey = configService.get('guid.lastSelectedAgent');
        if (cancelled) return;

        const resolvedSavedKey = resolveAssistantSelectionKey(savedKey, assistants);
        if (resolvedSavedKey) {
          _setSelectedAssistantId(resolvedSavedKey);
          return;
        }

        _setSelectedAssistantId(pickDefaultAssistantSelectionKey(assistants));
      } catch (error) {
        console.error('Failed to load last selected assistant:', error);
      }
    };

    void restoreSavedSelection();

    return () => {
      cancelled = true;
    };
  }, [assistants, preselectAgentKey, resetAssistant]);

  const selectedAssistant = useMemo(
    () =>
      selectedAssistantIdState ? assistants.find((assistant) => assistant.id === selectedAssistantIdState) : undefined,
    [assistants, selectedAssistantIdState]
  );
  const selectedAssistantId = selectedAssistant?.id ?? null;
  const selectedAssistantBackend = selectedAssistant?.preset_agent_type || 'aionrs';

  const selectedAssistantAvailable = useMemo(() => {
    if (selectedAssistantBackend === 'gemini') {
      return isGoogleAuth || modelList.length > 0;
    }
    return agents.some((agent) => (agent.backend ?? agent.agent_type) === selectedAssistantBackend);
  }, [agents, isGoogleAuth, modelList, selectedAssistantBackend]);

  useEffect(() => {
    const backend = selectedAssistantBackend;
    selectedBackendRef.current = backend;

    const config = configService.get('acp.config');
    const preferredModelId = (config?.[backend] as Record<string, unknown> | undefined)?.preferredModelId as
      | string
      | undefined;
    if (preferredModelId) {
      _setSelectedAcpModel(preferredModelId);
      return;
    }

    const matched = agents.find((agent) => (agent.backend ?? agent.agent_type) === backend);
    const handshakeModels = matched?.handshake?.available_models as AcpModelInfo | undefined;
    _setSelectedAcpModel(handshakeModels?.current_model_id ?? null);
  }, [agents, selectedAssistantBackend]);

  useEffect(() => {
    const backend = selectedAssistantBackend;
    selectedBackendRef.current = backend;
    const fallbackMode = resolveDefaultMode(backend, agents);
    _setSelectedMode(fallbackMode);

    let cancelled = false;

    const loadPreferredMode = async () => {
      try {
        let preferred: string | undefined;
        let yoloMode = false;

        if (backend === 'aionrs') {
          const config = configService.get('aionrs.config');
          preferred = config?.preferredMode;
        } else {
          const config = configService.get('acp.config');
          const backendConfig = config?.[backend] as Record<string, unknown> | undefined;
          preferred = backendConfig?.preferredMode as string | undefined;
          yoloMode = (backendConfig?.yoloMode as boolean) ?? false;
        }

        if (cancelled) return;

        const normalizedPreferred = backend === 'codex' ? normalizeCodexMode(preferred) : preferred;
        if (normalizedPreferred) {
          const modes = getAgentModes(backend);
          if (modes.some((mode) => mode.value === normalizedPreferred)) {
            _setSelectedMode(normalizedPreferred);
            return;
          }
        }

        if (yoloMode) {
          const yoloValues: Record<string, string> = {
            claude: 'bypassPermissions',
            gemini: 'yolo',
            codex: CODEX_MODE_NATIVE_FULL_ACCESS,
            qwen: 'yolo',
          };
          _setSelectedMode(yoloValues[backend] || 'yolo');
        }
      } catch {
        // ignore
      }
    };

    void loadPreferredMode();

    return () => {
      cancelled = true;
    };
  }, [agents, selectedAssistantBackend]);

  const currentAcpCachedModelInfo = useMemo(() => {
    const backend = selectedAssistantBackend;
    const matched = agents.find((agent) => (agent.backend ?? agent.agent_type) === backend);
    const handshakeModels = matched?.handshake?.available_models as AcpModelInfo | undefined;
    if (
      handshakeModels &&
      Array.isArray(handshakeModels.available_models) &&
      handshakeModels.available_models.length > 0
    ) {
      return handshakeModels;
    }

    if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
      return {
        current_model_id: DEFAULT_CODEX_MODELS[0].id,
        current_model_label: DEFAULT_CODEX_MODELS[0].label,
        available_models: DEFAULT_CODEX_MODELS.map((model) => ({ id: model.id, label: model.label })),
      } satisfies AcpModelInfo;
    }

    return null;
  }, [agents, selectedAssistantBackend]);

  const defaultAssistantId = useMemo(() => pickDefaultAssistantSelectionKey(assistants), [assistants]);

  return {
    selectedAssistantId,
    setSelectedAssistantId,
    defaultAssistantId,
    selectedAssistant,
    selectedAssistantBackend,
    selectedAssistantAvailable,
    assistants,
    selectedMode,
    setSelectedMode,
    selectedAcpModel,
    setSelectedAcpModel,
    currentAcpCachedModelInfo,
  };
};
