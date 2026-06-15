/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { CODEX_MODE_NATIVE_FULL_ACCESS, normalizeCodexMode } from '@/common/types/codex/codexModes';
import type { IProvider } from '@/common/config/storage';
import { configService } from '@/common/config/configService';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { AcpSessionModes } from '@/common/types/platform/acpTypes';
import type { AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import type { AgentMetadata, AgentSource } from '@/renderer/utils/model/agentTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { savePreferredMode, savePreferredModelId, getAgentKey as getAgentKeyUtil } from './agentSelectionUtils';
import { usePresetAssistantResolver } from './usePresetAssistantResolver';
import { useAgentAvailability } from './useAgentAvailability';
import { useCustomAgentsLoader } from './useCustomAgentsLoader';
import { isSupportedNewConversationAgent } from '@/renderer/utils/model/agentTypeSupportPolicy';
import { useAgents } from '@/renderer/hooks/agent/useAgents';

export type GuidAgentSelectionResult = {
  selectedAgentKey: string;
  setSelectedAgentKey: (key: string) => void;
  defaultAgentKey: string;
  selectedAgent: string;
  selectedAssistantId: string | null;
  selectedAgentInfo: AvailableAgent | undefined;
  is_presetAgent: boolean;
  availableAgents: AvailableAgent[] | undefined;
  /** Backend-merged preset catalog: builtin + user. */
  assistants: Assistant[];
  /** User-defined ACP engine rows (agent_source === 'custom') from the backend. */
  customAgents: AgentMetadata[];
  selectedMode: string;
  setSelectedMode: (mode: React.SetStateAction<string>, options?: { persistPreference?: boolean }) => void;
  selectedAcpModel: string | null;
  setSelectedAcpModel: (model: React.SetStateAction<string | null>, options?: { persistPreference?: boolean }) => void;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  getAgentKey: (agent: {
    agent_type: string;
    agent_source?: AgentSource;
    backend?: string;
    id?: string;
    custom_agent_id?: string;
  }) => string;
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  resolvePresetRulesAndSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<{ rules?: string }>;
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

/**
 * Resolve the default session_mode for a given backend.
 *
 * Priority:
 *   1. Handshake `available_modes.current_mode_id` from `/api/agents`
 *   2. First entry of handshake `available_modes`
 *   3. First entry of the static `AGENT_MODES` table
 *   4. Literal `'default'` (legacy fallback — only correct for claude/qwen/gemini/aionrs)
 *
 * This mirrors the runtime fallback inside `AgentModeSelector` so the
 * parent-held `selectedMode` stays in sync with what the UI shows.
 */
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

type UseGuidAgentSelectionOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  localeKey: string;
  resetAssistant?: boolean;
  /** Pre-select a specific agent by key (e.g. from "Go to Chat" deep-links). */
  preselectAgentKey?: string;
  /** React Router location.key — changes on every navigation, used to detect new resets. */
  locationKey?: string;
};

const toAssistantSelectionKey = (assistantId: string): string => `custom:${assistantId}`;

export function resolveAssistantSelectionKey(savedKey: string | undefined, assistants: Assistant[]): string | undefined {
  if (!savedKey) return undefined;

  if (savedKey.startsWith('custom:')) {
    const assistantId = savedKey.slice(7);
    return assistants.some((assistant) => assistant.id === assistantId) ? savedKey : undefined;
  }

  if (assistants.some((assistant) => assistant.id === savedKey)) {
    return toAssistantSelectionKey(savedKey);
  }

  const backendMatch = assistants.find((assistant) => assistant.preset_agent_type === savedKey);
  return backendMatch ? toAssistantSelectionKey(backendMatch.id) : undefined;
}

export function pickDefaultAssistantSelectionKey(assistants: Assistant[]): string {
  const enabledAssistants = assistants.filter((assistant) => assistant.enabled !== false);
  const preferred =
    enabledAssistants.find((assistant) => assistant.source === 'bare' && assistant.preset_agent_type === 'aionrs') ??
    enabledAssistants.find((assistant) => assistant.preset_agent_type === 'aionrs') ??
    enabledAssistants[0];
  return preferred ? toAssistantSelectionKey(preferred.id) : toAssistantSelectionKey('aionrs');
}

/**
 * Hook that manages agent selection, availability, and preset assistant logic.
 */
export const useGuidAgentSelection = ({
  modelList,
  isGoogleAuth,
  localeKey,
  resetAssistant,
  preselectAgentKey,
  locationKey,
}: UseGuidAgentSelectionOptions): GuidAgentSelectionResult => {
  const [selectedAgentKey, _setSelectedAgentKey] = useState<string>(() => {
    try {
      return configService.get('guid.lastSelectedAgent') || '';
    } catch {
      return '';
    }
  });
  const [selectedMode, _setSelectedMode] = useState<string>('default');
  // Track whether mode was loaded from preferences to avoid overwriting during initial load
  const selectedAgentRef = useRef<string | null>(null);
  // Guard: only run the initial restore once; user selections are never overwritten
  const initialRestoreDoneRef = useRef(false);
  const [selectedAcpModel, _setSelectedAcpModel] = useState<string | null>(null);
  const { agents } = useAgents();

  const availableAgents = useMemo<AvailableAgent[]>(
    () =>
      agents.filter(isSupportedNewConversationAgent).map((agent) => {
        const isCustomRow = agent.agent_source === 'custom';
        return {
          ...agent,
          custom_agent_id: isCustomRow ? agent.id : agent.custom_agent_id,
          avatar: isCustomRow ? agent.icon : undefined,
        } satisfies AvailableAgent;
      }),
    [agents]
  );

  // Wrap setSelectedMode to also save preferred mode to the agent's own config
  const setSelectedMode = useCallback(
    (mode: React.SetStateAction<string>, options?: { persistPreference?: boolean }) => {
      _setSelectedMode((prev) => {
        const newMode = typeof mode === 'function' ? mode(prev) : mode;
        const agentKey = selectedAgentRef.current;
        if (agentKey && options?.persistPreference !== false) {
          void savePreferredMode(agentKey, newMode);
        }
        return newMode;
      });
    },
    []
  );

  // Wrap setSelectedAcpModel to also save preferred model to the agent's config
  const setSelectedAcpModel = useCallback(
    (model_id: React.SetStateAction<string | null>, options?: { persistPreference?: boolean }) => {
      _setSelectedAcpModel((prev) => {
        const newModelId = typeof model_id === 'function' ? model_id(prev) : model_id;
        const agentKey = selectedAgentRef.current;
        if (
          agentKey &&
          agentKey !== 'gemini' &&
          agentKey !== 'custom' &&
          newModelId &&
          options?.persistPreference !== false
        ) {
          void savePreferredModelId(agentKey, newModelId);
        }
        return newModelId;
      });
    },
    []
  );

  const availableCustomAgentIds = useMemo(() => {
    const ids = new Set<string>();
    (availableAgents || []).forEach((agent) => {
      if (agent.agent_source === 'custom' && agent.id) {
        ids.add(agent.id);
      } else if (agent.custom_agent_id) {
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

  // Wrap setSelectedAgentKey to also save to storage
  const setSelectedAgentKey = useCallback(
    (key: string) => {
      initialRestoreDoneRef.current = true;
      const normalizedKey = resolveAssistantSelectionKey(key, assistants) ?? key;
      _setSelectedAgentKey(normalizedKey);
      configService.set('guid.lastSelectedAgent', normalizedKey).catch((error) => {
        console.error('Failed to save selected agent:', error);
      });
    },
    [assistants]
  );

  const { isMainAgentAvailable, getEffectiveAgentType } = useAgentAvailability({
    modelList,
    isGoogleAuth,
    availableAgents,
    resolvePresetAgentType,
  });

  /**
   * Find agent by key.
   *
   * Key formats:
   *   - Plain id (custom ACP / remote rows) → resolved by `AvailableAgent.id`.
   *   - Plain backend or agent_type (builtin rows) → resolved by `backend` or
   *     `agent_type` fallback.
   *   - `custom:<assistantId>` → preset assistant from the assistant catalog
   *     (kept as the only surviving prefix path; preset assistants are a
   *     different selection surface from AgentRegistry rows).
   */
  const findAgentByKey = (key: string): AvailableAgent | undefined => {
    if (key.startsWith('custom:')) {
      const assistantId = key.slice(7);
      const assistant = assistants.find((a) => a.id === assistantId);
      if (assistant) {
        return {
          agent_type: assistant.preset_agent_type || 'gemini',
          backend: assistant.preset_agent_type || 'gemini',
          name: assistant.name,
          id: assistant.id,
          custom_agent_id: assistant.id,
          is_preset: true,
          context: '',
          avatar: assistant.avatar,
          presetAgentType: assistant.preset_agent_type,
        };
      }
      return undefined;
    }
    const assistant = assistants.find((item) => item.id === key);
    if (assistant) {
      return {
        agent_type: assistant.preset_agent_type || 'gemini',
        backend: assistant.preset_agent_type || 'gemini',
        name: assistant.name,
        id: assistant.id,
        custom_agent_id: assistant.id,
        is_preset: true,
        context: '',
        avatar: assistant.avatar,
        presetAgentType: assistant.preset_agent_type,
      };
    }
    // Row id (custom ACP / remote) takes precedence, so two rows sharing
    // the same backend do not collide.
    const byId = availableAgents?.find((a) => a.id === key);
    if (byId) return byId;
    return availableAgents?.find((a) => a.backend === key || a.agent_type === key);
  };

  // Derived state: collapse row-scoped rows to a stable slot key so shared
  // config namespaces (acp.config / mode preferences) are not fragmented
  // per row.
  const selectedAgentInfo = useMemo(() => {
    return findAgentByKey(selectedAgentKey);
  }, [selectedAgentKey, availableAgents, assistants]);
  const selectedAgent = useMemo((): string => {
    if (selectedAgentKey.startsWith('custom:')) return 'custom';
    if (assistants.some((assistant) => assistant.id === selectedAgentKey)) return 'custom';
    if (selectedAgentInfo?.agent_source === 'custom') return 'custom';
    return selectedAgentKey;
  }, [assistants, selectedAgentInfo?.agent_source, selectedAgentKey]);
  const is_presetAgent = Boolean(selectedAgentInfo?.is_preset);
  const selectedAssistantId = useMemo(() => {
    if (selectedAgentKey.startsWith('custom:')) {
      return selectedAgentKey.slice(7);
    }
    if (assistants.some((assistant) => assistant.id === selectedAgentKey)) {
      return selectedAgentKey;
    }
    return selectedAgentInfo?.custom_agent_id ?? null;
  }, [assistants, selectedAgentInfo?.custom_agent_id, selectedAgentKey]);

  // Track whether the resetAssistant flag has been consumed so it only fires once
  // per navigation. Use locationKey (changes on every navigate()) to reset the guard,
  // because window.history.replaceState does NOT update React Router's location.state.
  const resetHandledRef = useRef(false);
  const prevLocationKeyRef = useRef(locationKey);
  if (locationKey !== prevLocationKeyRef.current) {
    prevLocationKeyRef.current = locationKey;
    resetHandledRef.current = false;
  }

  // Apply sidebar "new chat" resets and explicit "Go to Chat" pre-selections
  // before paint so the previous assistant selection does not flash for a
  // frame when navigating to /guid again.
  useLayoutEffect(() => {
    if (assistants.length === 0) return;
    if (resetHandledRef.current) return;

    // Explicit pre-selection wins when it maps to an assistant.
    if (preselectAgentKey) {
      const resolvedPreselect = resolveAssistantSelectionKey(preselectAgentKey, assistants);
      if (resolvedPreselect) {
        resetHandledRef.current = true;
        _setSelectedAgentKey(resolvedPreselect);
        configService.set('guid.lastSelectedAgent', resolvedPreselect).catch((error) => {
          console.error('Failed to save preselected agent key:', error);
        });
        return;
      }
    }

    if (resetAssistant) {
      resetHandledRef.current = true;
      const fallbackKey = pickDefaultAssistantSelectionKey(assistants);
      _setSelectedAgentKey(fallbackKey);
      configService.set('guid.lastSelectedAgent', fallbackKey).catch((error) => {
        console.error('Failed to save reset agent key:', error);
      });
    }
  }, [assistants, resetAssistant, preselectAgentKey, locationKey]);

  // Load last selected agent when no explicit reset was requested.
  useEffect(() => {
    if (assistants.length === 0) return;
    if (resetAssistant) return;
    if (preselectAgentKey && resolveAssistantSelectionKey(preselectAgentKey, assistants)) return;

    let cancelled = false;
    initialRestoreDoneRef.current = true;

    const restoreSavedSelection = async () => {
      try {
        const savedKey = configService.get('guid.lastSelectedAgent');
        if (cancelled) return;

        const resolvedSavedKey = resolveAssistantSelectionKey(savedKey, assistants);
        if (resolvedSavedKey) {
          _setSelectedAgentKey(resolvedSavedKey);
          return;
        }

        _setSelectedAgentKey(pickDefaultAssistantSelectionKey(assistants));
      } catch (error) {
        console.error('Failed to load last selected agent:', error);
      }
    };

    void restoreSavedSelection();

    return () => {
      cancelled = true;
    };
  }, [assistants, resetAssistant, preselectAgentKey, locationKey]);

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

  // Reset selected ACP model when agent changes: prefer saved preference, fallback to handshake default
  useEffect(() => {
    // For preset agents, resolve to the actual backend type for config lookup
    const backend = is_presetAgent ? currentEffectiveAgentInfo.agent_type : selectedAgent;

    const config = configService.get('acp.config');
    const preferred = (config?.[backend as string] as Record<string, unknown>)?.preferredModelId as string | undefined;
    if (preferred) {
      _setSelectedAcpModel(preferred);
      return;
    }

    const metadataAgents = agents;
    const matched = metadataAgents?.find((a) => (a.backend ?? a.agent_type) === backend);
    const handshakeModels = matched?.handshake?.available_models as AcpModelInfo | undefined;
    _setSelectedAcpModel(handshakeModels?.current_model_id ?? null);
  }, [selectedAgentKey, agents, is_presetAgent, currentEffectiveAgentInfo.agent_type, selectedAgent]);

  // Read preferred mode or fallback to legacy yoloMode config
  useEffect(() => {
    // For preset agents, use the effective backend type for config lookup and mode saving
    const configKey = is_presetAgent ? currentEffectiveAgentInfo.agent_type : selectedAgent;
    selectedAgentRef.current = configKey;
    // Reset to the backend's actual default (from handshake.available_modes),
    // not the literal 'default' — codex/opencode/cursor don't have that value.
    const fallbackMode = resolveDefaultMode(configKey, agents);
    _setSelectedMode(fallbackMode);
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
          const backendConfig = config?.[configKey as string] as Record<string, unknown> | undefined;
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
  }, [selectedAgent, selectedAgentKey, is_presetAgent, currentEffectiveAgentInfo.agent_type, agents]);

  const currentAcpCachedModelInfo = useMemo(() => {
    // For preset agents, resolve to the actual backend type for model list lookup
    const backend = is_presetAgent ? currentEffectiveAgentInfo.agent_type : selectedAgent;

    // Source: `handshake.available_models` from `/api/agents`.
    // The backend persists the last-seen `ModelInfoPayload` (snake_case) on
    // the agent_metadata row, so this is populated across restarts without
    // requiring a fresh session.
    const metadataAgents = agents;
    const matched = metadataAgents?.find((a) => (a.backend ?? a.agent_type) === backend);
    const handshakeModels = matched?.handshake?.available_models as AcpModelInfo | undefined;
    if (
      handshakeModels &&
      Array.isArray(handshakeModels.available_models) &&
      handshakeModels.available_models.length > 0
    ) {
      return handshakeModels;
    }

    // Fallback: when the backend has not yet observed a session for codex
    // (e.g., first launch before any warmup), use the hardcoded default list
    // so the Guid page shows a model selector immediately.
    if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
      return {
        current_model_id: DEFAULT_CODEX_MODELS[0].id,
        current_model_label: DEFAULT_CODEX_MODELS[0].label,
        available_models: DEFAULT_CODEX_MODELS.map((m) => ({ id: m.id, label: m.label })),
      } satisfies AcpModelInfo;
    }

    return null;
  }, [selectedAgentKey, is_presetAgent, currentEffectiveAgentInfo.agent_type, agents]);

  // Key of the first non-preset CLI agent (used as fallback when leaving preset mode)
  const defaultAgentKey = useMemo(() => {
    return pickDefaultAssistantSelectionKey(assistants);
  }, [assistants]);

  return {
    selectedAgentKey,
    setSelectedAgentKey,
    defaultAgentKey,
    selectedAgent,
    selectedAssistantId,
    selectedAgentInfo,
    is_presetAgent,
    availableAgents,
    assistants,
    customAgents,
    selectedMode,
    setSelectedMode,
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
    resolveDisabledBuiltinSkills,
    isMainAgentAvailable,
    getEffectiveAgentType,
    refreshCustomAgents,
    customAgentAvatarMap,
  };
};
