/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import type { IProvider } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import type { AcpBackend, AcpBackendConfig, AcpModelInfo, AvailableAgent, EffectiveAgentInfo, PresetAgentType } from '../types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';

export type GuidAgentSelectionResult = {
  selectedAgentKey: string;
  setSelectedAgentKey: (key: string) => void;
  selectedAgent: AcpBackend | 'custom';
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
  getAgentKey: (agent: { backend: AcpBackend; customAgentId?: string }) => string;
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  resolvePresetRulesAndSkills: (agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined) => Promise<{ rules?: string; skills?: string }>;
  resolvePresetContext: (agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined) => Promise<string | undefined>;
  resolvePresetAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => PresetAgentType;
  resolveEnabledSkills: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => string[] | undefined;
  isMainAgentAvailable: (agentType: PresetAgentType) => boolean;
  getAvailableFallbackAgent: () => PresetAgentType | null;
  getEffectiveAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => EffectiveAgentInfo;
  refreshCustomAgents: () => Promise<void>;
  customAgentAvatarMap: Map<string, string | undefined>;
};

type UseGuidAgentSelectionOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  localeKey: string;
};

/**
 * Hook that manages agent selection, availability, and preset assistant logic.
 */
export const useGuidAgentSelection = ({ modelList, isGoogleAuth, localeKey }: UseGuidAgentSelectionOptions): GuidAgentSelectionResult => {
  const [selectedAgentKey, _setSelectedAgentKey] = useState<string>('gemini');
  const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>();
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);
  const [selectedMode, setSelectedMode] = useState<string>('default');
  const [acpCachedModels, setAcpCachedModels] = useState<Record<string, AcpModelInfo>>({});
  const [selectedAcpModel, setSelectedAcpModel] = useState<string | null>(null);

  // Wrap setSelectedAgentKey to also save to storage
  const setSelectedAgentKey = useCallback((key: string) => {
    _setSelectedAgentKey(key);
    ConfigStorage.set('guid.lastSelectedAgent', key).catch((error) => {
      console.error('Failed to save selected agent:', error);
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

  /**
   * Get agent key for selection.
   * Returns "custom:uuid" for custom agents, backend type for others.
   */
  const getAgentKey = (agent: { backend: AcpBackend; customAgentId?: string }) => {
    return agent.backend === 'custom' && agent.customAgentId ? `custom:${agent.customAgentId}` : agent.backend;
  };

  /**
   * Find agent by key.
   * Supports both "custom:uuid" format and plain backend type.
   */
  const findAgentByKey = (key: string): AvailableAgent | undefined => {
    if (key.startsWith('custom:')) {
      const customAgentId = key.slice(7);
      const foundInAvailable = availableAgents?.find((a) => a.backend === 'custom' && a.customAgentId === customAgentId);
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
    return availableAgents?.find((a) => a.backend === key);
  };

  // Derived state
  const selectedAgent = selectedAgentKey.startsWith('custom:') ? ('custom' as const) : (selectedAgentKey as AcpBackend);
  const selectedAgentInfo = useMemo(() => findAgentByKey(selectedAgentKey), [selectedAgentKey, availableAgents, customAgents]);
  const isPresetAgent = Boolean(selectedAgentInfo?.isPreset);

  const customAgentAvatarMap = useMemo(() => {
    return new Map(customAgents.map((agent) => [agent.id, agent.avatar]));
  }, [customAgents]);

  // --- SWR: Fetch available agents ---
  const { data: availableAgentsData } = useSWR('acp.agents.available', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return result.data.filter((agent) => !(agent.backend === 'gemini' && agent.cliPath));
    }
    return [];
  });

  useEffect(() => {
    if (availableAgentsData) {
      setAvailableAgents(availableAgentsData);
    }
  }, [availableAgentsData]);

  // Load last selected agent
  useEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;

    let cancelled = false;

    const loadLastSelectedAgent = async () => {
      try {
        const savedAgentKey = await ConfigStorage.get('guid.lastSelectedAgent');
        if (cancelled || !savedAgentKey) return;

        const isInAvailable = availableAgents.some((agent) => {
          const key = agent.backend === 'custom' && agent.customAgentId ? `custom:${agent.customAgentId}` : agent.backend;
          return key === savedAgentKey;
        });

        if (isInAvailable) {
          _setSelectedAgentKey(savedAgentKey);
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

  // Load custom agents
  useEffect(() => {
    let isActive = true;
    ConfigStorage.get('acp.customAgents')
      .then((agents) => {
        if (!isActive) return;
        const list = (agents || []).filter((agent: AcpBackendConfig) => availableCustomAgentIds.has(agent.id));
        setCustomAgents(list);
      })
      .catch((error) => {
        console.error('Failed to load custom agents:', error);
      });
    return () => {
      isActive = false;
    };
  }, [availableCustomAgentIds]);

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

  // Reset selected ACP model when agent changes
  useEffect(() => {
    const backend = selectedAgentKey.startsWith('custom:') ? 'custom' : selectedAgentKey;
    const cachedInfo = acpCachedModels[backend];
    if (cachedInfo?.currentModelId) {
      setSelectedAcpModel(cachedInfo.currentModelId);
    } else {
      setSelectedAcpModel(null);
    }
  }, [selectedAgentKey, acpCachedModels]);

  // Read legacy yoloMode config
  useEffect(() => {
    setSelectedMode('default');
    if (!selectedAgent) return;

    const readLegacyYoloMode = async () => {
      try {
        let yoloMode = false;
        if (selectedAgent === 'gemini') {
          const config = await ConfigStorage.get('gemini.config');
          yoloMode = config?.yoloMode ?? false;
        } else if (selectedAgent === 'codex') {
          const config = await ConfigStorage.get('codex.config');
          yoloMode = config?.yoloMode ?? false;
        } else if (selectedAgent !== 'custom' && selectedAgent !== 'openclaw-gateway' && selectedAgent !== 'nanobot') {
          const config = await ConfigStorage.get('acp.config');
          yoloMode = (config?.[selectedAgent as AcpBackend] as any)?.yoloMode ?? false;
        }
        if (yoloMode) {
          const yoloValues: Record<string, string> = {
            claude: 'bypassPermissions',
            gemini: 'yolo',
            codex: 'yolo',
            iflow: 'yolo',
            qwen: 'yolo',
          };
          setSelectedMode(yoloValues[selectedAgent] || 'yolo');
        }
      } catch {
        /* silent */
      }
    };
    void readLegacyYoloMode();
  }, [selectedAgent]);

  // --- Preset assistant resolution ---
  const resolvePresetRulesAndSkills = useCallback(
    async (agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined): Promise<{ rules?: string; skills?: string }> => {
      if (!agentInfo) return {};
      if (agentInfo.backend !== 'custom') {
        return { rules: agentInfo.context };
      }

      const customAgentId = agentInfo.customAgentId;
      if (!customAgentId) return { rules: agentInfo.context };

      let rules = '';
      let skills = '';

      try {
        rules = await ipcBridge.fs.readAssistantRule.invoke({
          assistantId: customAgentId,
          locale: localeKey,
        });
      } catch (error) {
        console.warn(`Failed to load rules for ${customAgentId}:`, error);
      }

      try {
        skills = await ipcBridge.fs.readAssistantSkill.invoke({
          assistantId: customAgentId,
          locale: localeKey,
        });
      } catch (_error) {
        // skills may not exist, this is normal
      }

      // Fallback for builtin assistants
      if (customAgentId.startsWith('builtin-')) {
        const presetId = customAgentId.replace('builtin-', '');
        const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
        if (preset) {
          if (!rules && preset.ruleFiles) {
            try {
              const ruleFile = preset.ruleFiles[localeKey] || preset.ruleFiles['en-US'];
              if (ruleFile) {
                rules = await ipcBridge.fs.readBuiltinRule.invoke({ fileName: ruleFile });
              }
            } catch (e) {
              console.warn(`Failed to load builtin rules for ${customAgentId}:`, e);
            }
          }
          if (!skills && preset.skillFiles) {
            try {
              const skillFile = preset.skillFiles[localeKey] || preset.skillFiles['en-US'];
              if (skillFile) {
                skills = await ipcBridge.fs.readBuiltinSkill.invoke({ fileName: skillFile });
              }
            } catch (_e) {
              // skills fallback failure is ok
            }
          }
        }
      }

      return { rules: rules || agentInfo.context, skills };
    },
    [localeKey]
  );

  const resolvePresetContext = useCallback(
    async (agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined): Promise<string | undefined> => {
      const { rules } = await resolvePresetRulesAndSkills(agentInfo);
      return rules;
    },
    [resolvePresetRulesAndSkills]
  );

  const resolvePresetAgentType = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => {
      if (!agentInfo) return 'gemini' as PresetAgentType;
      if (agentInfo.backend !== 'custom') return agentInfo.backend as PresetAgentType;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.customAgentId);
      return customAgent?.presetAgentType || ('gemini' as PresetAgentType);
    },
    [customAgents]
  );

  const resolveEnabledSkills = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined): string[] | undefined => {
      if (!agentInfo) return undefined;
      if (agentInfo.backend !== 'custom') return undefined;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.customAgentId);
      return customAgent?.enabledSkills;
    },
    [customAgents]
  );

  // --- Availability checks ---
  const isMainAgentAvailable = useCallback(
    (agentType: PresetAgentType): boolean => {
      if (agentType === 'gemini') {
        return isGoogleAuth || (modelList != null && modelList.length > 0);
      }
      return availableAgents?.some((agent) => agent.backend === agentType) ?? false;
    },
    [modelList, availableAgents, isGoogleAuth]
  );

  const getAvailableFallbackAgent = useCallback((): PresetAgentType | null => {
    const fallbackOrder: PresetAgentType[] = ['gemini', 'claude', 'codex', 'codebuddy', 'opencode'];
    for (const agentType of fallbackOrder) {
      if (isMainAgentAvailable(agentType)) {
        return agentType;
      }
    }
    return null;
  }, [isMainAgentAvailable]);

  const getEffectiveAgentType = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined): EffectiveAgentInfo => {
      const originalType = resolvePresetAgentType(agentInfo);
      const isAvailable = isMainAgentAvailable(originalType);
      return { agentType: originalType, isFallback: false, originalType, isAvailable };
    },
    [resolvePresetAgentType, isMainAgentAvailable]
  );

  const currentEffectiveAgentInfo = useMemo(() => {
    if (!isPresetAgent) {
      const isAvailable = isMainAgentAvailable(selectedAgent as PresetAgentType);
      return { agentType: selectedAgent as PresetAgentType, isFallback: false, originalType: selectedAgent as PresetAgentType, isAvailable };
    }
    return getEffectiveAgentType(selectedAgentInfo);
  }, [isPresetAgent, selectedAgent, selectedAgentInfo, getEffectiveAgentType, isMainAgentAvailable]);

  const currentAcpCachedModelInfo = useMemo(() => {
    const backend = selectedAgentKey.startsWith('custom:') ? 'custom' : selectedAgentKey;
    return acpCachedModels[backend] || null;
  }, [selectedAgentKey, acpCachedModels]);

  // Auto-switch only for Gemini agent
  useEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;
    if (selectedAgent === 'gemini' && !currentEffectiveAgentInfo.isAvailable) {
      console.log('[Guid] Gemini is not configured. Will check for alternatives when sending.');
    }
  }, [availableAgents, currentEffectiveAgentInfo, selectedAgent]);

  const refreshCustomAgents = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch (error) {
      console.error('Failed to refresh custom agents:', error);
    }
  }, []);

  useEffect(() => {
    void refreshCustomAgents();
  }, [refreshCustomAgents]);

  return {
    selectedAgentKey,
    setSelectedAgentKey,
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
    getAgentKey,
    findAgentByKey,
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    isMainAgentAvailable,
    getAvailableFallbackAgent,
    getEffectiveAgentType,
    refreshCustomAgents,
    customAgentAvatarMap,
  };
};
