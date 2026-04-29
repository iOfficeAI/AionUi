/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { CODEX_MODE_NATIVE_FULL_ACCESS, normalizeCodexMode } from '@/common/types/codex/codexModes';
import type { IProvider } from '@/common/config/storage';
import { configService } from '@/common/config/configService';
import type { AcpBackendAll, AcpSessionConfigOption } from '@/common/types/acpTypes';
import type { Assistant } from '@/common/types/assistantTypes';
import type { AcpBackend, AcpBackendConfig, AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { savePreferredMode, savePreferredModelId, getAgentKey as getAgentKeyUtil } from './agentSelectionUtils';
import { usePresetAssistantResolver } from './usePresetAssistantResolver';
import { useAgentAvailability } from './useAgentAvailability';
import { useCustomAgentsLoader } from './useCustomAgentsLoader';

export type GuidAgentSelectionResult = {
  selectedAgentKey: string;
  setSelectedAgentKey: (key: string) => void;
  defaultAgentKey: string;
  selectedAgent: string;
  selectedAgentInfo: AvailableAgent | undefined;
  is_presetAgent: boolean;
  availableAgents: AvailableAgent[] | undefined;
  /** Backend-merged preset catalog: builtin + user + extension. */
  assistants: Assistant[];
  /** User-defined ACP engine configs (CLI path, args) from ConfigStorage. */
  customAgents: AcpBackendConfig[];
  selectedMode: string;
  setSelectedMode: React.Dispatch<React.SetStateAction<string>>;
  acpCachedModels: Record<string, AcpModelInfo>;
  selectedAcpModel: string | null;
  setSelectedAcpModel: React.Dispatch<React.SetStateAction<string | null>>;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  cached_config_options: AcpSessionConfigOption[];
  pending_config_options: Record<string, string>;
  setPendingConfigOption: (config_id: string, value: string) => void;
  getAgentKey: (agent: { agent_type: string; backend?: string; custom_agent_id?: string }) => string;
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  resolvePresetRulesAndSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolvePresetContext: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<string | undefined>;
  resolvePresetAgentType: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string;
  resolveEnabledSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  isMainAgentAvailable: (agent_type: string) => boolean;
  getEffectiveAgentType: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => EffectiveAgentInfo;
  refreshCustomAgents: () => Promise<void>;
  customAgentAvatarMap: Map<string, string | undefined>;
};

type UseGuidAgentSelectionOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  localeKey: string;
  resetAssistant?: boolean;
  /** React Router location.key — changes on every navigation, used to detect new resets. */
  locationKey?: string;
};

/**
 * Hook that manages agent selection, availability, and preset assistant logic.
 */
export const useGuidAgentSelection = ({
  modelList,
  isGoogleAuth,
  localeKey,
  resetAssistant,
  locationKey,
}: UseGuidAgentSelectionOptions): GuidAgentSelectionResult => {
  const [selectedAgentKey, _setSelectedAgentKey] = useState<string>('aionrs');
  const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>();
  const [selectedMode, _setSelectedMode] = useState<string>('default');
  // Track whether mode was loaded from preferences to avoid overwriting during initial load
  const selectedAgentRef = useRef<string | null>(null);
  // Guard: only run the initial restore once; user selections are never overwritten
  const initialRestoreDoneRef = useRef(false);
  const [acpCachedModels, setAcpCachedModels] = useState<Record<string, AcpModelInfo>>({});
  const [selectedAcpModel, _setSelectedAcpModel] = useState<string | null>(null);
  const [cached_config_options, setCachedConfigOptions] = useState<AcpSessionConfigOption[]>([]);
  const [pending_config_options, setPendingConfigOptions] = useState<Record<string, string>>({});

  // Wrap setSelectedAgentKey to also save to storage
  const setSelectedAgentKey = useCallback((key: string) => {
    initialRestoreDoneRef.current = true;
    _setSelectedAgentKey(key);
    configService.set('guid.lastSelectedAgent', key).catch((error) => {
      console.error('Failed to save selected agent:', error);
    });
  }, []);

  // Wrap setSelectedMode to also save preferred mode to the agent's own config
  const setSelectedMode = useCallback((mode: React.SetStateAction<string>) => {
    _setSelectedMode((prev) => {
      const newMode = typeof mode === 'function' ? mode(prev) : mode;
      const agentKey = selectedAgentRef.current;
      if (agentKey) {
        void savePreferredMode(agentKey, newMode);
      }
      return newMode;
    });
  }, []);

  // Update a single pending config option selection (local mode, Guid page)
  const setPendingConfigOption = useCallback((config_id: string, value: string) => {
    setPendingConfigOptions((prev) => ({ ...prev, [config_id]: value }));
  }, []);

  // Wrap setSelectedAcpModel to also save preferred model to the agent's config
  const setSelectedAcpModel = useCallback((model_id: React.SetStateAction<string | null>) => {
    _setSelectedAcpModel((prev) => {
      const newModelId = typeof model_id === 'function' ? model_id(prev) : model_id;
      const agentKey = selectedAgentRef.current;
      if (agentKey && agentKey !== 'gemini' && agentKey !== 'custom' && newModelId) {
        void savePreferredModelId(agentKey, newModelId);
      }
      return newModelId;
    });
  }, []);

  const availableCustomAgentIds = useMemo(() => {
    const ids = new Set<string>();
    (availableAgents || []).forEach((agent) => {
      if (agent.custom_agent_id) {
        ids.add(agent.custom_agent_id);
      }
    });
    return ids;
  }, [availableAgents]);

  const getAgentKey = getAgentKeyUtil;

  // --- Sub-hooks ---
  const { assistants, customAgents, customAgentAvatarMap, refreshCustomAgents } = useCustomAgentsLoader({
    availableCustomAgentIds,
  });

  const {
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
  } = usePresetAssistantResolver({ assistants, localeKey });

  const { isMainAgentAvailable, getEffectiveAgentType } = useAgentAvailability({
    modelList,
    isGoogleAuth,
    availableAgents,
    resolvePresetAgentType,
  });

  /**
   * Find agent by key.
   * Supports "custom:uuid", "remote:uuid" format, and plain backend type.
   */
  const findAgentByKey = (key: string): AvailableAgent | undefined => {
    if (key.startsWith('custom:')) {
      const custom_agent_id = key.slice(7);
      const foundInAvailable = availableAgents?.find((a) => a.custom_agent_id === custom_agent_id);
      if (foundInAvailable) return foundInAvailable;

      // "custom:<id>" keys point at the preset catalog for prompt-only
      // assistants (backend merge), not the ACP engine-config table.
      const assistant = assistants.find((a) => a.id === custom_agent_id);
      if (assistant) {
        return {
          agent_type: assistant.preset_agent_type || 'gemini',
          backend: assistant.preset_agent_type || 'gemini',
          name: assistant.name,
          custom_agent_id: assistant.id,
          is_preset: true,
          context: '',
          avatar: assistant.avatar,
          presetAgentType: assistant.preset_agent_type,
        };
      }
    }
    if (key.startsWith('remote:')) {
      const remoteId = key.slice(7);
      return availableAgents?.find((a) => a.agent_type === 'remote' && a.custom_agent_id === remoteId);
    }
    return availableAgents?.find((a) => a.backend === key || a.agent_type === key);
  };

  // Derived state
  const selectedAgent: string = selectedAgentKey.startsWith('custom:')
    ? 'custom'
    : selectedAgentKey.startsWith('remote:')
      ? 'remote'
      : selectedAgentKey;
  const selectedAgentInfo = useMemo(() => {
    return findAgentByKey(selectedAgentKey);
  }, [selectedAgentKey, availableAgents, assistants]);
  const is_presetAgent = Boolean(selectedAgentInfo?.is_preset);

  // --- SWR: Fetch detected execution engines (shared cache) ---
  const { data: availableAgentsData } = useSWR<AvailableAgent[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  // Fetch remote agents from DB and merge into available agents
  const { data: remoteAgentsData } = useSWR('remote-agents.list', () => ipcBridge.remoteAgent.list.invoke());

  useEffect(() => {
    if (!availableAgentsData) return;
    const remoteAsAvailable: AvailableAgent[] = (remoteAgentsData || []).map((ra) => ({
      agent_type: 'remote',
      name: ra.name,
      custom_agent_id: ra.id,
      avatar: ra.avatar,
    }));
    setAvailableAgents([...availableAgentsData, ...remoteAsAvailable]);
  }, [availableAgentsData, remoteAgentsData]);

  // Track whether the resetAssistant flag has been consumed so it only fires once
  // per navigation. Use locationKey (changes on every navigate()) to reset the guard,
  // because window.history.replaceState does NOT update React Router's location.state.
  const resetHandledRef = useRef(false);
  const prevLocationKeyRef = useRef(locationKey);
  if (locationKey !== prevLocationKeyRef.current) {
    prevLocationKeyRef.current = locationKey;
    resetHandledRef.current = false;
  }

  // Apply sidebar "new chat" resets before paint so the previous assistant
  // selection does not flash for a frame when navigating to /guid again.
  useLayoutEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;

    if (resetAssistant && !resetHandledRef.current) {
      resetHandledRef.current = true;
      const firstCliAgent = availableAgents.find((a) => !a.is_preset);
      const fallbackKey = firstCliAgent ? getAgentKey(firstCliAgent) : 'aionrs';
      _setSelectedAgentKey(fallbackKey);
      configService.set('guid.lastSelectedAgent', fallbackKey).catch((error) => {
        console.error('Failed to save reset agent key:', error);
      });
    }
  }, [availableAgents, resetAssistant, locationKey]);

  // Load last selected agent when no explicit reset was requested.
  useEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;
    if (resetAssistant) return;

    let cancelled = false;
    initialRestoreDoneRef.current = true;

    const restoreSavedSelection = async () => {
      try {
        const savedKey = configService.get('guid.lastSelectedAgent');
        if (cancelled) return;

        if (savedKey) {
          // Prefixed keys — trust directly, the referenced data resolves later
          if (savedKey.startsWith('custom:') || savedKey.startsWith('remote:')) {
            _setSelectedAgentKey(savedKey);
            return;
          }
          // Plain backend key — verify it still exists in detected engines
          if (availableAgents.some((agent) => getAgentKey(agent) === savedKey)) {
            _setSelectedAgentKey(savedKey);
            return;
          }
        }

        // No saved preference or stale key — default to first detected engine
        const firstAgent = availableAgents[0];
        if (firstAgent) {
          _setSelectedAgentKey(getAgentKey(firstAgent));
        }
      } catch (error) {
        console.error('Failed to load last selected agent:', error);
      }
    };

    void restoreSavedSelection();

    return () => {
      cancelled = true;
    };
  }, [availableAgents, resetAssistant, locationKey]);

  // Load cached ACP model lists
  useEffect(() => {
    const cached = configService.get('acp.cachedModels');
    setAcpCachedModels(cached || {});
  }, []);

  const currentEffectiveAgentInfo = useMemo(() => {
    if (!is_presetAgent) {
      const isAvailable = isMainAgentAvailable(selectedAgent as string);
      return {
        agent_type: selectedAgent as string,
        isFallback: false,
        originalType: selectedAgent as string,
        isAvailable,
      };
    }
    return getEffectiveAgentType(selectedAgentInfo);
  }, [is_presetAgent, selectedAgent, selectedAgentInfo, getEffectiveAgentType, isMainAgentAvailable]);

  // Load cached ACP config options per backend
  useEffect(() => {
    const backend = is_presetAgent
      ? currentEffectiveAgentInfo.agent_type
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;
    if (!backend) return;
    const cached = configService.get('acp.cached_config_options');
    const options = cached?.[backend];
    const filtered = Array.isArray(options)
      ? (options as Array<{ category?: string }>).filter((opt) => opt.category !== 'model' && opt.category !== 'mode')
      : [];
    setCachedConfigOptions(filtered as AcpSessionConfigOption[]);
    setPendingConfigOptions({});
  }, [selectedAgentKey, is_presetAgent, currentEffectiveAgentInfo.agent_type]);

  // Reset selected ACP model when agent changes: prefer saved preference, fallback to cached default
  useEffect(() => {
    // For preset agents, resolve to the actual backend type for config lookup
    const backend = is_presetAgent
      ? currentEffectiveAgentInfo.agent_type
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;

    const config = configService.get('acp.config');
    const preferred = (config?.[backend as AcpBackendAll] as Record<string, unknown>)?.preferredModelId as
      | string
      | undefined;
    if (preferred) {
      _setSelectedAcpModel(preferred);
    } else {
      const cachedInfo = acpCachedModels[backend];
      _setSelectedAcpModel(cachedInfo?.current_model_id ?? null);
    }
  }, [selectedAgentKey, acpCachedModels, is_presetAgent, currentEffectiveAgentInfo.agent_type]);

  // Read preferred mode or fallback to legacy yoloMode config
  useEffect(() => {
    _setSelectedMode('default');
    // For preset agents, use the effective backend type for config lookup and mode saving
    const configKey = is_presetAgent ? currentEffectiveAgentInfo.agent_type : selectedAgent;
    selectedAgentRef.current = configKey;
    if (!configKey) return;

    let cancelled = false;

    const loadPreferredMode = async () => {
      try {
        // Read preferredMode from the agent's own config, fallback to legacy yoloMode
        let preferred: string | undefined;
        let yoloMode = false;

        if (configKey === 'aionrs') {
          const config = configService.get('aionrs.config');
          preferred = config?.preferredMode;
        } else {
          const config = configService.get('acp.config');
          const backendConfig = config?.[configKey as AcpBackendAll] as Record<string, unknown> | undefined;
          preferred = backendConfig?.preferredMode as string | undefined;
          yoloMode = (backendConfig?.yoloMode as boolean) ?? false;
        }

        if (cancelled) return;

        // 1. Use preferredMode if valid
        const normalizedPreferred = configKey === 'codex' ? normalizeCodexMode(preferred) : preferred;
        if (normalizedPreferred) {
          const modes = getAgentModes(configKey);
          if (modes.some((m) => m.value === normalizedPreferred)) {
            _setSelectedMode(normalizedPreferred);
            return;
          }
        }

        // 2. Fallback: legacy yoloMode
        if (yoloMode) {
          const yoloValues: Record<string, string> = {
            claude: 'bypassPermissions',
            gemini: 'yolo',
            codex: CODEX_MODE_NATIVE_FULL_ACCESS,
            qwen: 'yolo',
          };
          _setSelectedMode(yoloValues[configKey] || 'yolo');
        }
      } catch {
        /* silent */
      }
    };

    void loadPreferredMode();

    return () => {
      cancelled = true;
    };
  }, [selectedAgent, is_presetAgent, currentEffectiveAgentInfo.agent_type]);

  const currentAcpCachedModelInfo = useMemo(() => {
    // For preset agents, resolve to the actual backend type for model list lookup
    const backend = is_presetAgent
      ? currentEffectiveAgentInfo.agent_type
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;
    const cached = acpCachedModels[backend];
    if (cached) return cached;

    // Fallback: when no cached models exist for codex (e.g., first launch or stale cache),
    // use the hardcoded default list so the Guid page shows a model selector immediately.
    if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
      return {
        current_model_id: DEFAULT_CODEX_MODELS[0].id,
        current_model_label: DEFAULT_CODEX_MODELS[0].label,
        available_models: DEFAULT_CODEX_MODELS.map((m) => ({ id: m.id, label: m.label })),
      } satisfies AcpModelInfo;
    }

    return null;
  }, [selectedAgentKey, acpCachedModels, is_presetAgent, currentEffectiveAgentInfo.agent_type]);

  // Key of the first non-preset CLI agent (used as fallback when leaving preset mode)
  const defaultAgentKey = useMemo(() => {
    const firstCliAgent = availableAgents?.find((a) => !a.is_preset);
    return firstCliAgent ? getAgentKey(firstCliAgent) : 'aionrs';
  }, [availableAgents]);

  return {
    selectedAgentKey,
    setSelectedAgentKey,
    defaultAgentKey,
    selectedAgent,
    selectedAgentInfo,
    is_presetAgent,
    availableAgents,
    assistants,
    customAgents,
    selectedMode,
    setSelectedMode,
    acpCachedModels,
    selectedAcpModel,
    setSelectedAcpModel,
    currentAcpCachedModelInfo,
    currentEffectiveAgentInfo,
    cached_config_options,
    pending_config_options,
    setPendingConfigOption,
    getAgentKey,
    findAgentByKey,
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    isMainAgentAvailable,
    getEffectiveAgentType,
    refreshCustomAgents,
    customAgentAvatarMap,
  };
};
