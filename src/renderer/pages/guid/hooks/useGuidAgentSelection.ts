/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AcpSessionConfigOption, AgentBackend } from '@/common/types/acpTypes';
import {
  createCodexReasoningEffortConfigOption,
  getDefaultAcpConfigOptions,
  normalizeCodexConfigOptions,
  normalizeCodexConfigOptionValues,
} from '@/common/types/codex/codexConfigOptions';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackend, AcpBackendConfig, AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { savePreferredMode, savePreferredModelId, getAgentKey as getAgentKeyUtil } from './agentSelectionUtils';
import { usePresetAssistantResolver } from './usePresetAssistantResolver';
import { useAgentAvailability } from './useAgentAvailability';
import { useCustomAgentsLoader } from './useCustomAgentsLoader';

const filterVisibleAcpConfigOptions = (options: unknown, backend?: string): AcpSessionConfigOption[] => {
  if (!Array.isArray(options)) {
    return [];
  }

  const visibleOptions = (options as AcpSessionConfigOption[]).filter(
    (opt) => opt.category !== 'model' && opt.category !== 'mode'
  );

  return backend === 'codex' ? normalizeCodexConfigOptions(visibleOptions) : visibleOptions;
};

const normalizeCachedAcpConfigOptions = (
  cached?: Record<string, AcpSessionConfigOption[]> | null
): Record<string, AcpSessionConfigOption[]> => {
  if (!cached) {
    return {};
  }

  return {
    ...cached,
    ...(Array.isArray(cached.codex) && { codex: normalizeCodexConfigOptions(cached.codex) }),
  };
};

export type GuidAgentSelectionResult = {
  selectedAgentKey: string;
  setSelectedAgentKey: (key: string) => void;
  defaultAgentKey: string;
  selectedAgent: AcpBackend | 'custom';
  selectedAgentInfo: AvailableAgent | undefined;
  isPresetAgent: boolean;
  availableAgents: AvailableAgent[] | undefined;
  customAgents: AcpBackendConfig[];
  selectedMode: string;
  setSelectedMode: React.Dispatch<React.SetStateAction<string>>;
  acpCachedModels: Record<string, AcpModelInfo>;
  currentAcpCachedConfigOptions: AcpSessionConfigOption[];
  selectedAcpConfigOptions: Record<string, string>;
  setSelectedAcpConfigOption: (configId: string, value: string) => void;
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
  getAvailableFallbackAgent: () => string | null;
  getEffectiveAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => EffectiveAgentInfo;
  refreshCustomAgents: () => Promise<void>;
  customAgentAvatarMap: Map<string, string | undefined>;
};

type UseGuidAgentSelectionOptions = {
  modelList: IProvider[];
  currentModel?: TProviderWithModel;
  isGoogleAuth: boolean;
  localeKey: string;
  resetAssistant?: boolean;
  locationKey?: string;
};

/**
 * Hook that manages agent selection, availability, and preset assistant logic.
 */
export const useGuidAgentSelection = ({
  modelList,
  currentModel,
  isGoogleAuth,
  localeKey,
}: UseGuidAgentSelectionOptions): GuidAgentSelectionResult => {
  const [selectedAgentKey, _setSelectedAgentKey] = useState<string>('aionrs');
  const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>();
  const [selectedMode, _setSelectedMode] = useState<string>('default');
  // Track whether mode was loaded from preferences to avoid overwriting during initial load
  const selectedAgentRef = useRef<string | null>(null);
  const probedModelBackendsRef = useRef(new Set<string>());
  const selectedAcpModelBackendRef = useRef<string | null>(null);
  const hasUserSelectedAcpModelRef = useRef(false);
  const [acpCachedModels, setAcpCachedModels] = useState<Record<string, AcpModelInfo>>({});
  const [liveModelInfoBackends, setLiveModelInfoBackends] = useState<Record<string, boolean>>({});
  const [acpCachedConfigOptions, setAcpCachedConfigOptions] = useState<Record<string, AcpSessionConfigOption[]>>({});
  const [selectedAcpConfigOptions, setSelectedAcpConfigOptions] = useState<Record<string, string>>({});
  const [selectedAcpModel, _setSelectedAcpModel] = useState<string | null>(null);
  const [cachedConfigOptions, setCachedConfigOptions] = useState<AcpSessionConfigOption[]>([]);
  const [pendingConfigOptions, setPendingConfigOptions] = useState<Record<string, string>>({});

  // Wrap setSelectedAgentKey to also save to storage
  const setSelectedAgentKey = useCallback((key: string) => {
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
  const setSelectedAcpModel = useCallback(
    (modelId: React.SetStateAction<string | null>) => {
      _setSelectedAcpModel((prev) => {
        const newModelId = typeof modelId === 'function' ? modelId(prev) : modelId;
        const agentKey = selectedAgentRef.current;
        hasUserSelectedAcpModelRef.current = Boolean(newModelId);
        selectedAcpModelBackendRef.current = agentKey;
        if (agentKey && agentKey !== 'gemini' && agentKey !== 'custom' && newModelId) {
          void savePreferredModelId(agentKey, newModelId);
        }
        if (agentKey === 'codex' && newModelId) {
          setPendingConfigOptions((pending) => {
            const cachedReasoningOption = cachedConfigOptions.find((option) => option.id === 'reasoning_effort');
            const reasoningOption = createCodexReasoningEffortConfigOption({
              modelInfo: acpCachedModels.codex,
              selectedModelId: newModelId,
              currentValue:
                pending.reasoning_effort || cachedReasoningOption?.currentValue || cachedReasoningOption?.selectedValue,
            });
            return reasoningOption.currentValue
              ? { ...pending, reasoning_effort: reasoningOption.currentValue }
              : pending;
          });
        }
        return newModelId;
      });
    },
    [acpCachedModels.codex, cachedConfigOptions]
  );

  const setSelectedAcpConfigOption = useCallback((configId: string, value: string) => {
    setSelectedAcpConfigOptions((prev) => {
      const next = { ...prev, [configId]: value };
      const agentKey = selectedAgentRef.current;

      if (agentKey === 'aionrs') {
        void ConfigStorage.get('aionrs.config')
          .then((config) =>
            ConfigStorage.set('aionrs.config', {
              ...config,
              preferredConfigOptions: next,
            })
          )
          .catch(() => {
            // Best effort only.
          });
      } else if (agentKey && agentKey !== 'gemini' && agentKey !== 'custom') {
        void ConfigStorage.get('acp.config')
          .then((config) => {
            const backendConfig = config?.[agentKey as AgentBackend] || {};
            return ConfigStorage.set('acp.config', {
              ...config,
              [agentKey]: {
                ...backendConfig,
                preferredConfigOptions: next,
              },
            });
          })
          .catch(() => {
            // Best effort only.
          });
      }

      return next;
    });
  }, []);

  const availableCustomAgentIds = useMemo(() => {
    const ids = new Set<string>();
    (availableAgents || []).forEach((agent) => {
      if (agent.backend === 'custom' && agent.customAgentId) {
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

  const { isMainAgentAvailable, getAvailableFallbackAgent, getEffectiveAgentType } = useAgentAvailability({
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
      const foundInAvailable = availableAgents?.find(
        (a) => a.backend === 'custom' && a.customAgentId === customAgentId
      );
      if (foundInAvailable) return foundInAvailable;

      const assistant = customAgents.find((a) => a.id === customAgentId);
      if (assistant) {
        return {
          backend: 'custom' as AcpBackend,
          name: assistant.name,
          customAgentId: assistant.id,
          isPreset: true,
          context: '',
          avatar: assistant.avatar,
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
  const selectedAgent = selectedAgentKey.startsWith('custom:')
    ? ('custom' as const)
    : selectedAgentKey.startsWith('remote:')
      ? ('remote' as AcpBackend)
      : (selectedAgentKey as AcpBackend);
  const selectedAgentInfo = useMemo(
    () => findAgentByKey(selectedAgentKey),
    [selectedAgentKey, availableAgents, customAgents]
  );
  const isPresetAgent = Boolean(selectedAgentInfo?.isPreset);
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
  const currentConfigBackendKey = useMemo(() => {
    const candidate = isPresetAgent ? currentEffectiveAgentInfo.agentType : selectedAgent;
    if (!candidate || candidate === 'gemini' || candidate === 'custom') {
      return undefined;
    }
    return candidate;
  }, [currentEffectiveAgentInfo.agentType, isPresetAgent, selectedAgent]);
  const currentConfigBackend = useMemo(() => {
    if (!currentConfigBackendKey) {
      return undefined;
    }
    return currentConfigBackendKey as AgentBackend;
  }, [currentConfigBackendKey]);
  const currentAcpCachedConfigOptions = useMemo(() => {
    if (!currentConfigBackendKey) {
      return [];
    }

    const cachedOptions = acpCachedConfigOptions[currentConfigBackendKey];
    if (cachedOptions && cachedOptions.length > 0) {
      return filterVisibleAcpConfigOptions(cachedOptions, currentConfigBackendKey);
    }

    return getDefaultAcpConfigOptions(currentConfigBackend, currentModel);
  }, [acpCachedConfigOptions, currentConfigBackend, currentConfigBackendKey, currentModel]);

  // --- SWR: Fetch available agents ---
  const { data: availableAgentsData } = useSWR<AvailableAgent[]>('acp.agents.available', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return (result.data as AvailableAgent[]).filter((agent) => !(agent.backend === 'gemini' && agent.cliPath));
    }
    return [];
  });

  // Fetch remote agents from DB and merge into available agents
  const { data: remoteAgentsData } = useSWR('remote-agents.list', () => ipcBridge.remoteAgent.list.invoke());

  useEffect(() => {
    if (!availableAgentsData) return;
    const remoteAsAvailable: AvailableAgent[] = (remoteAgentsData || []).map((ra) => ({
      backend: 'remote' as AcpBackend,
      name: ra.name,
      customAgentId: ra.id,
      avatar: ra.avatar,
    }));
    setAvailableAgents([...availableAgentsData, ...remoteAsAvailable]);
  }, [availableAgentsData, remoteAgentsData]);

  // Load last selected agent
  useEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;

    let cancelled = false;

    const loadLastSelectedAgent = async () => {
      try {
        const savedAgentKey = await ConfigStorage.get('guid.lastSelectedAgent');
        if (cancelled) return;

        if (savedAgentKey) {
          const isInAvailable = availableAgents.some((agent) => getAgentKey(agent) === savedAgentKey);
          if (isInAvailable) {
            _setSelectedAgentKey(savedAgentKey);
            return;
          }
        }

        // No saved preference or saved agent no longer available — default to first agent
        const firstAgent = availableAgents[0];
        if (firstAgent) {
          const firstKey = getAgentKey(firstAgent);
          _setSelectedAgentKey(firstKey);
        }
      } catch (error) {
        console.error('Failed to load last selected agent:', error);
      }
    };

    void loadLastSelectedAgent();

    return () => {
      cancelled = true;
    };
  }, [availableAgents]);

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

  // Load cached ACP config option lists
  useEffect(() => {
    let isActive = true;
    ConfigStorage.get('acp.cachedConfigOptions')
      .then((cached) => {
        if (!isActive) return;
        setAcpCachedConfigOptions(normalizeCachedAcpConfigOptions(cached));
      })
      .catch(() => {
        // Silently ignore - cached config options are optional
      });
    return () => {
      isActive = false;
    };
  }, []);

  // Probe Codex model info on first selection through the native app-server.
  useEffect(() => {
    if (selectedAgentKey !== 'codex') return;
    if (probedModelBackendsRef.current.has('codex')) return;

    const probeModelInfo = ipcBridge.acpConversation.probeModelInfo;
    if (!probeModelInfo?.invoke) return;

    let cancelled = false;
    probedModelBackendsRef.current.add('codex');

    probeModelInfo
      .invoke({ backend: 'codex' })
      .then(async (result) => {
        if (cancelled) return;
        const modelInfo = result.success ? result.data?.modelInfo : null;
        if (!modelInfo?.availableModels?.length) {
          probedModelBackendsRef.current.delete('codex');
          return;
        }

        const [cached, cachedConfigOptions] = await Promise.all([
          ConfigStorage.get('acp.cachedModels').catch(() => ({})),
          ConfigStorage.get('acp.cachedConfigOptions').catch(() => ({})),
        ]);
        if (cancelled) return;

        const visibleModelInfo = modelInfo;
        const nextCachedModels = {
          ...cached,
          codex: visibleModelInfo,
        };
        const visibleConfigOptions = filterVisibleAcpConfigOptions(result.data?.configOptions, 'codex');

        setAcpCachedModels((prev) => ({
          ...prev,
          codex: visibleModelInfo,
        }));
        setLiveModelInfoBackends((prev) => ({
          ...prev,
          codex: true,
        }));

        if (visibleConfigOptions.length > 0) {
          setAcpCachedConfigOptions((prev) => ({
            ...prev,
            codex: visibleConfigOptions,
          }));
          setCachedConfigOptions(visibleConfigOptions);
        }

        await ConfigStorage.set('acp.cachedModels', nextCachedModels).catch((error) => {
          console.error('Failed to save probed ACP model info:', error);
        });
        if (visibleConfigOptions.length > 0) {
          await ConfigStorage.set('acp.cachedConfigOptions', {
            ...cachedConfigOptions,
            codex: visibleConfigOptions,
          }).catch((error) => {
            console.error('Failed to save probed ACP config options:', error);
          });
        }
      })
      .catch((error) => {
        probedModelBackendsRef.current.delete('codex');
        console.warn('[Guid][codex] Failed to probe model info:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgentKey]);

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
        const filtered = filterVisibleAcpConfigOptions(cached?.[backend], backend);
        const fallbackOptions =
          filtered.length > 0 ? filtered : getDefaultAcpConfigOptions(backend as AgentBackend, currentModel);
        setCachedConfigOptions(fallbackOptions);
        setPendingConfigOptions({});
      })
      .catch(() => {
        if (!isActive) return;
        setCachedConfigOptions(getDefaultAcpConfigOptions(backend as AgentBackend, currentModel));
        setPendingConfigOptions({});
      });
    return () => {
      isActive = false;
    };
  }, [selectedAgentKey, isPresetAgent, currentEffectiveAgentInfo.agentType, currentModel]);

  // Reset selected ACP model when agent changes: prefer saved preference, fallback to cached default
  useEffect(() => {
    // For preset agents, resolve to the actual backend type for config lookup
    const backend = isPresetAgent
      ? currentEffectiveAgentInfo.agentType
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;

    if (selectedAcpModelBackendRef.current !== backend) {
      selectedAcpModelBackendRef.current = backend;
      hasUserSelectedAcpModelRef.current = false;
    }

    if (backend === 'codex') {
      if (!hasUserSelectedAcpModelRef.current) {
        const cachedInfo = liveModelInfoBackends.codex ? acpCachedModels[backend] : undefined;
        _setSelectedAcpModel(cachedInfo?.currentModelId ?? null);
      }
      return;
    }

    let cancelled = false;
    // Read preferred model from acp.config[backend], fallback to cached model list default
    void ConfigStorage.get('acp.config')
      .then((config) => {
        if (cancelled) return;
        const preferred = (config?.[backend as AgentBackend] as Record<string, unknown>)?.preferredModelId as
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
  }, [selectedAgentKey, acpCachedModels, liveModelInfoBackends, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  useEffect(() => {
    if (!currentConfigBackendKey) {
      setSelectedAcpConfigOptions({});
      return;
    }

    let cancelled = false;

    const loadPreferredConfigOptions =
      currentConfigBackendKey === 'aionrs'
        ? ConfigStorage.get('aionrs.config').then((config) => config?.preferredConfigOptions || {})
        : ConfigStorage.get('acp.config').then(
            (config) => config?.[currentConfigBackendKey as AgentBackend]?.preferredConfigOptions || {}
          );

    loadPreferredConfigOptions
      .then((preferred) => {
        if (cancelled) return;
        const normalizedPreferred =
          currentConfigBackendKey === 'codex' ? normalizeCodexConfigOptionValues(preferred) : preferred;
        const defaults = currentAcpCachedConfigOptions.reduce<Record<string, string>>((acc, option) => {
          const candidate = normalizedPreferred[option.id] || option.currentValue || option.selectedValue;
          if (candidate) {
            acc[option.id] = candidate;
          }
          return acc;
        }, {});
        setSelectedAcpConfigOptions(defaults);
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedAcpConfigOptions({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAcpCachedConfigOptions, currentConfigBackendKey]);

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
          const backendConfig = config?.[configKey as AgentBackend] as Record<string, unknown> | undefined;
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
    if (backend === 'codex') {
      return liveModelInfoBackends.codex ? cached || null : null;
    }

    if (cached) {
      return cached;
    }

    return null;
  }, [selectedAgentKey, acpCachedModels, liveModelInfoBackends, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  // Auto-switch only for Gemini agent
  useEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;
    if (selectedAgent === 'gemini' && !currentEffectiveAgentInfo.isAvailable) {
      console.log('[Guid] Gemini is not configured. Will check for alternatives when sending.');
    }
  }, [availableAgents, currentEffectiveAgentInfo, selectedAgent]);

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
    currentAcpCachedConfigOptions,
    selectedAcpConfigOptions,
    setSelectedAcpConfigOption,
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
    getAvailableFallbackAgent,
    getEffectiveAgentType,
    refreshCustomAgents,
    customAgentAvatarMap,
  };
};
