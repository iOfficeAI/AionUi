/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { assistantRuntimeKey, isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import type { AcpModelInfo } from '../types';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCustomAgentsLoader } from './useCustomAgentsLoader';

export type GuidAssistantSelectionResult = {
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

function resolveDefaultMode(backend: string | undefined): string {
  if (!backend) return 'default';

  const staticModes = getAgentModes(backend);
  if (staticModes.length > 0) return staticModes[0].value;

  return 'default';
}

export function resolveInitialAssistantModel(backend: string, models: string[]): string | null {
  if (models.length > 0) {
    return models[0];
  }

  if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
    return DEFAULT_CODEX_MODELS[0]?.id ?? null;
  }

  return null;
}

export function buildAssistantModelInfo(backend: string, models: string[]): AcpModelInfo | null {
  if (models.length > 0) {
    return {
      current_model_id: models[0],
      current_model_label: models[0],
      available_models: models.map((model) => ({ id: model, label: model })),
    } satisfies AcpModelInfo;
  }

  if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
    return {
      current_model_id: DEFAULT_CODEX_MODELS[0].id,
      current_model_label: DEFAULT_CODEX_MODELS[0].label,
      available_models: DEFAULT_CODEX_MODELS.map((model) => ({ id: model.id, label: model.label })),
    } satisfies AcpModelInfo;
  }

  return null;
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

  return undefined;
}

export function pickDefaultAssistantSelectionKey(assistants: Assistant[]): string | null {
  const enabledAssistants = assistants.filter((assistant) => assistant.enabled !== false);
  const preferred =
    enabledAssistants.find((assistant) => assistant.source === 'generated' && isAionrsAssistant(assistant)) ??
    enabledAssistants.find((assistant) => isAionrsAssistant(assistant)) ??
    enabledAssistants[0];
  return preferred?.id ?? null;
}

type UseGuidAssistantSelectionOptions = {
  resetAssistant?: boolean;
  preselectAssistantId?: string;
  locationKey?: string;
};

export const useGuidAssistantSelection = ({
  resetAssistant,
  preselectAssistantId,
  locationKey,
}: UseGuidAssistantSelectionOptions): GuidAssistantSelectionResult => {
  const [selectedAssistantIdState, _setSelectedAssistantId] = useState<string | null>(null);
  const [selectedMode, _setSelectedMode] = useState<string>('default');
  const [selectedAcpModel, _setSelectedAcpModel] = useState<string | null>(null);
  const { assistants } = useCustomAgentsLoader();

  const setSelectedMode = useCallback(
    (mode: React.SetStateAction<string>, _options?: { persistPreference?: boolean }) => {
      _setSelectedMode((prev) => {
        const nextMode = typeof mode === 'function' ? mode(prev) : mode;
        return nextMode;
      });
    },
    []
  );

  const setSelectedAcpModel = useCallback(
    (modelId: React.SetStateAction<string | null>, _options?: { persistPreference?: boolean }) => {
      _setSelectedAcpModel((prev) => {
        const nextModelId = typeof modelId === 'function' ? modelId(prev) : modelId;
        return nextModelId;
      });
    },
    []
  );

  const setSelectedAssistantId = useCallback(
    (assistantId: string) => {
      const normalizedId = resolveAssistantSelectionKey(assistantId, assistants) ?? assistantId;
      _setSelectedAssistantId(normalizedId);
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

    if (preselectAssistantId) {
      const resolvedPreselect = resolveAssistantSelectionKey(preselectAssistantId, assistants);
      if (resolvedPreselect) {
        resetHandledRef.current = true;
        _setSelectedAssistantId(resolvedPreselect);
        return;
      }
    }

    if (resetAssistant) {
      resetHandledRef.current = true;
      const fallbackId = pickDefaultAssistantSelectionKey(assistants);
      _setSelectedAssistantId(fallbackId);
    }
  }, [assistants, preselectAssistantId, resetAssistant]);

  useEffect(() => {
    if (assistants.length === 0) return;
    if (resetAssistant) return;
    if (preselectAssistantId && resolveAssistantSelectionKey(preselectAssistantId, assistants)) return;
    if (!selectedAssistantIdState || !assistants.some((assistant) => assistant.id === selectedAssistantIdState)) {
      _setSelectedAssistantId(pickDefaultAssistantSelectionKey(assistants));
    }
  }, [assistants, preselectAssistantId, resetAssistant, selectedAssistantIdState]);

  const selectedAssistant = useMemo(
    () =>
      selectedAssistantIdState ? assistants.find((assistant) => assistant.id === selectedAssistantIdState) : undefined,
    [assistants, selectedAssistantIdState]
  );
  const selectedAssistantId = selectedAssistant?.id ?? null;
  const selectedAssistantBackend = assistantRuntimeKey(selectedAssistant);
  const selectedAssistantModels = selectedAssistant?.models ?? [];

  const selectedAssistantAvailable = useMemo(() => {
    return selectedAssistant?.agent_status === 'online';
  }, [selectedAssistant]);

  useEffect(() => {
    const backend = selectedAssistantBackend;
    _setSelectedAcpModel(resolveInitialAssistantModel(backend, selectedAssistantModels));
  }, [selectedAssistantBackend, selectedAssistantModels]);

  useEffect(() => {
    const backend = selectedAssistantBackend;
    const fallbackMode = resolveDefaultMode(backend);
    _setSelectedMode(fallbackMode);
  }, [selectedAssistantBackend]);

  const currentAcpCachedModelInfo = useMemo(() => {
    return buildAssistantModelInfo(selectedAssistantBackend, selectedAssistantModels);
  }, [selectedAssistantBackend, selectedAssistantModels]);

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
