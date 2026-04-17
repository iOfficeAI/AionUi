/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import type { IProvider } from '@/common/config/storage';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendAll, AcpSessionConfigOption } from '@/common/types/acpTypes';
import type { AcpBackend, AcpBackendConfig, AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  isPresetAgent: boolean;
  availableAgents: AvailableAgent[] | undefined;
  customAgents: AcpBackendConfig[];
  selectedMode: string;
  setSelectedMode: React.Dispatch<React.SetStateAction<string>>;
  acpCachedModels: Record<string, AcpModelInfo>;
  selectedAcpModel: string | null;
  setSelectedAcpModel: React.Dispatch<React.SetStateAction<string | null>>;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  cachedConfigOptions: AcpSessionConfigOption[];
  pendingConfigOptions: Record<string, string>;
  setPendingConfigOption: (configId: string, value: string) => void;
  getAgentKey: (agent: { backend: AcpBackend; customAgentId?: string }) => string;
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  resolvePresetRulesAndSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolvePresetContext: (
    agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
  ) => Promise<string | undefined>;
  resolvePresetAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => string;
  resolveEnabledSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined
  ) => string[] | undefined;
  isMainAgentAvailable: (agentType: string) => boolean;
  getEffectiveAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => EffectiveAgentInfo;
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
  const [cachedConfigOptions, setCachedConfigOptions] = useState<AcpSessionConfigOption[]>([]);
  const [pendingConfigOptions, setPendingConfigOptions] = useState<Record<string, string>>({});

  // Wrap setSelectedAgentKey to also save to storage
  const setSelectedAgentKey = useCallback((key: string) => {
    initialRestoreDoneRef.current = true;
    _setSelectedAgentKey(key);
    ConfigStorage.set('guid.lastSelectedAgent', key).catch((error) => {
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
  const setPendingConfigOption = useCallback((configId: string, value: string) => {
    setPendingConfigOptions((prev) => ({ ...prev, [configId]: value }));
  }, []);

  // Wrap setSelectedAcpModel to also save preferred model to the agent's config
  const setSelectedAcpModel = useCallback((modelId: React.SetStateAction<string | null>) => {
    _setSelectedAcpModel((prev) => {
      const newModelId = typeof modelId === 'function' ? modelId(prev) : modelId;
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
      if (agent.customAgentId) {
        ids.add(agent.customAgentId);
      }
    });
    return ids;
  }, [availableAgents]);

  const getAgentKey = getAgentKeyUtil;

  // --- Sub-hooks ---
  const { customAgents, customAgentAvatarMap, refreshCustomAgents } = useCustomAgentsLoader({
    availableCustomAgentIds,
  });

  const {
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
  } = usePresetAssistantResolver({ customAgents, localeKey });

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
      const customAgentId = key.slice(7);
      const foundInAvailable = availableAgents?.find((a) => a.customAgentId === customAgentId);
      if (foundInAvailable) return foundInAvailable;

      const assistant = customAgents.find((a) => a.id === customAgentId);
      if (assistant) {
        return {
          backend: assistant.presetAgentType || 'gemini',
          name: assistant.name,
          customAgentId: assistant.id,
          isPreset: true,
          context: '',
          avatar: assistant.avatar,
          presetAgentType: assistant.presetAgentType,
        };
      }
    }
    if (key.startsWith('remote:')) {
      const remoteId = key.slice(7);
      return availableAgents?.find((a) => a.backend === 'remote' && a.customAgentId === remoteId);
    }
    return availableAgents?.find((a) => a.backend === key);
  };

  // Derived state
  const selectedAgent: string = selectedAgentKey.startsWith('custom:')
    ? 'custom'
    : selectedAgentKey.startsWith('remote:')
      ? 'remote'
      : selectedAgentKey;
  const selectedAgentInfo = useMemo(() => {
    return findAgentByKey(selectedAgentKey);
  }, [selectedAgentKey, availableAgents, customAgents]);
  const isPresetAgent = Boolean(selectedAgentInfo?.isPreset);

  // --- SWR: Fetch detected execution engines (shared cache) ---
  const { data: availableAgentsData } = useSWR<AvailableAgent[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  // Fetch remote agents from DB and merge into available agents
  const { data: remoteAgentsData } = useSWR('remote-agents.list', () => ipcBridge.remoteAgent.list.invoke());

  useEffect(() => {
    if (!availableAgentsData) return;
    const remoteAsAvailable: AvailableAgent[] = (remoteAgentsData || []).map((ra) => ({
      backend: 'remote',
      name: ra.name,
      customAgentId: ra.id,
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

  // Restore saved agent selection once on mount (or reset to default when resetAssistant
  // is requested). This effect must run exactly once — SWR revalidation causes
  // availableAgents to change reference on every fetch, so we use initialRestoreDoneRef
  // to prevent the restore from overwriting a user selection.
  //
  // For "custom:" / "remote:" keys we trust the saved value directly — customAgents
  // loads asynchronously and may not be ready yet, but findAgentByKey will resolve
  // correctly once the data arrives.
  useEffect(() => {
    if (initialRestoreDoneRef.current) return;
    if (!availableAgents || availableAgents.length === 0) return;

    // When the sidebar "新对话" navigates with resetAssistant, skip loading
    // from storage and immediately fall through to the default agent.
    // This also persists the default so the next load won't restore the old preset.
    if (resetAssistant && !resetHandledRef.current) {
      resetHandledRef.current = true;
      const firstCliAgent = availableAgents.find((a) => !a.isPreset);
      const fallbackKey = firstCliAgent ? getAgentKey(firstCliAgent) : 'aionrs';
      _setSelectedAgentKey(fallbackKey);
      ConfigStorage.set('guid.lastSelectedAgent', fallbackKey).catch((error) => {
        console.error('Failed to save reset agent key:', error);
      });
      return;
    }

    // Skip normal load when resetAssistant is still in location state (already handled above)
    if (resetAssistant) return;

    let cancelled = false;
    initialRestoreDoneRef.current = true;

    const restoreSavedSelection = async () => {
      try {
        const savedKey = await ConfigStorage.get('guid.lastSelectedAgent');
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
    let isActive = true;
    ConfigStorage.get('acp.cachedModels')
      .then((cached) => {
        if (!isActive) return;
        setAcpCachedModels(cached || {});
      })
      .catch(() => {
        // Silently ignore - cached models are optional
      });
    return () => {
      isActive = false;
    };
  }, []);

  const currentEffectiveAgentInfo = useMemo(() => {
    if (!isPresetAgent) {
      const isAvailable = isMainAgentAvailable(selectedAgent as string);
      return {
        agentType: selectedAgent as string,
        isFallback: false,
        originalType: selectedAgent as string,
        isAvailable,
      };
    }
    return getEffectiveAgentType(selectedAgentInfo);
  }, [isPresetAgent, selectedAgent, selectedAgentInfo, getEffectiveAgentType, isMainAgentAvailable]);

  // Load cached ACP config options per backend
  useEffect(() => {
    const backend = isPresetAgent
      ? currentEffectiveAgentInfo.agentType
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;
    if (!backend) return;
    let isActive = true;
    ConfigStorage.get('acp.cachedConfigOptions')
      .then((cached) => {
        if (!isActive) return;
        const options = cached?.[backend];
        // Filter out model/mode categories — those are handled by AcpModelSelector / AgentModeSelector
        const filtered = Array.isArray(options)
          ? (options as Array<{ category?: string }>).filter(
              (opt) => opt.category !== 'model' && opt.category !== 'mode'
            )
          : [];
        setCachedConfigOptions(filtered as AcpSessionConfigOption[]);
        setPendingConfigOptions({});
      })
      .catch(() => {
        if (!isActive) return;
        setCachedConfigOptions([]);
        setPendingConfigOptions({});
      });
    return () => {
      isActive = false;
    };
  }, [selectedAgentKey, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  // Reset selected ACP model when agent changes: prefer saved preference, fallback to cached default
  useEffect(() => {
    // For preset agents, resolve to the actual backend type for config lookup
    const backend = isPresetAgent
      ? currentEffectiveAgentInfo.agentType
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;

    let cancelled = false;
    // Read preferred model from acp.config[backend], fallback to cached model list default
    void ConfigStorage.get('acp.config')
      .then((config) => {
        if (cancelled) return;
        const preferred = (config?.[backend as AcpBackendAll] as Record<string, unknown>)?.preferredModelId as
          | string
          | undefined;
        if (preferred) {
          _setSelectedAcpModel(preferred);
        } else {
          const cachedInfo = acpCachedModels[backend];
          _setSelectedAcpModel(cachedInfo?.currentModelId ?? null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const cachedInfo = acpCachedModels[backend];
        _setSelectedAcpModel(cachedInfo?.currentModelId ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgentKey, acpCachedModels, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  // Read preferred mode or fallback to legacy yoloMode config
  useEffect(() => {
    _setSelectedMode('default');
    // For preset agents, use the effective backend type for config lookup and mode saving
    const configKey = isPresetAgent ? currentEffectiveAgentInfo.agentType : selectedAgent;
    selectedAgentRef.current = configKey;
    if (!configKey) return;

    let cancelled = false;

    const loadPreferredMode = async () => {
      try {
        // Read preferredMode from the agent's own config, fallback to legacy yoloMode
        let preferred: string | undefined;
        let yoloMode = false;

        if (configKey === 'gemini') {
          const config = await ConfigStorage.get('gemini.config');
          preferred = config?.preferredMode;
          yoloMode = config?.yoloMode ?? false;
        } else if (configKey === 'aionrs') {
          const config = await ConfigStorage.get('aionrs.config');
          preferred = config?.preferredMode;
        } else {
          const config = await ConfigStorage.get('acp.config');
          const backendConfig = config?.[configKey as AcpBackendAll] as Record<string, unknown> | undefined;
          preferred = backendConfig?.preferredMode as string | undefined;
          yoloMode = (backendConfig?.yoloMode as boolean) ?? false;
        }

        if (cancelled) return;

        // 1. Use preferredMode if valid
        if (preferred) {
          const modes = getAgentModes(configKey);
          if (modes.some((m) => m.value === preferred)) {
            _setSelectedMode(preferred);
            return;
          }
        }

        // 2. Fallback: legacy yoloMode
        if (yoloMode) {
          const yoloValues: Record<string, string> = {
            claude: 'bypassPermissions',
            gemini: 'yolo',
            codex: 'yolo',
            iflow: 'yolo',
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
  }, [selectedAgent, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  const currentAcpCachedModelInfo = useMemo(() => {
    // For preset agents, resolve to the actual backend type for model list lookup
    const backend = isPresetAgent
      ? currentEffectiveAgentInfo.agentType
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;
    const cached = acpCachedModels[backend];
    if (cached) return cached;

    // Fallback: when no cached models exist for codex (e.g., first launch or stale cache),
    // use the hardcoded default list so the Guid page shows a model selector immediately.
    if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
      return {
        source: 'models' as const,
        currentModelId: DEFAULT_CODEX_MODELS[0].id,
        currentModelLabel: DEFAULT_CODEX_MODELS[0].label,
        availableModels: DEFAULT_CODEX_MODELS.map((m) => ({ id: m.id, label: m.label })),
        canSwitch: true,
      } satisfies AcpModelInfo;
    }

    return null;
  }, [selectedAgentKey, acpCachedModels, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  // Key of the first non-preset CLI agent (used as fallback when leaving preset mode)
  const defaultAgentKey = useMemo(() => {
    const firstCliAgent = availableAgents?.find((a) => !a.isPreset);
    return firstCliAgent ? getAgentKey(firstCliAgent) : 'aionrs';
  }, [availableAgents]);

  return {
    selectedAgentKey,
    setSelectedAgentKey,
    defaultAgentKey,
    selectedAgent,
    selectedAgentInfo,
    isPresetAgent,
    availableAgents,
    customAgents,
    selectedMode,
    setSelectedMode,
    acpCachedModels,
    selectedAcpModel,
    setSelectedAcpModel,
    currentAcpCachedModelInfo,
    currentEffectiveAgentInfo,
    cachedConfigOptions,
    pendingConfigOptions,
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
