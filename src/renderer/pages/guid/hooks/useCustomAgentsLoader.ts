/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { Assistant } from '@/common/types/assistantTypes';
import type { AcpBackendConfig } from '../types';
import { DETECTED_AGENTS_SWR_KEY } from '@/renderer/utils/model/agentTypes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { mutate } from 'swr';

type UseCustomAgentsLoaderOptions = {
  availableCustomAgentIds: Set<string>;
};

type UseCustomAgentsLoaderResult = {
  customAgents: AcpBackendConfig[];
  customAgentAvatarMap: Map<string, string | undefined>;
  refreshCustomAgents: () => Promise<void>;
};

/**
 * Adapt a backend Assistant record into the AcpBackendConfig shape used by the
 * Guid page selection logic.
 */
function assistantToAcpBackendConfig(assistant: Assistant): AcpBackendConfig {
  return {
    id: assistant.id,
    name: assistant.name,
    nameI18n: Object.keys(assistant.nameI18n).length > 0 ? assistant.nameI18n : undefined,
    description: assistant.description,
    descriptionI18n:
      Object.keys(assistant.descriptionI18n).length > 0 ? assistant.descriptionI18n : undefined,
    avatar: assistant.avatar,
    isPreset: true,
    isBuiltin: assistant.source === 'builtin',
    enabled: assistant.enabled,
    presetAgentType: assistant.presetAgentType,
    context: assistant.context,
    contextI18n: Object.keys(assistant.contextI18n).length > 0 ? assistant.contextI18n : undefined,
    enabledSkills: assistant.enabledSkills.length > 0 ? assistant.enabledSkills : undefined,
    customSkillNames: assistant.customSkillNames.length > 0 ? assistant.customSkillNames : undefined,
    disabledBuiltinSkills:
      assistant.disabledBuiltinSkills.length > 0 ? assistant.disabledBuiltinSkills : undefined,
    prompts: assistant.prompts.length > 0 ? assistant.prompts : undefined,
    promptsI18n: Object.keys(assistant.promptsI18n).length > 0 ? assistant.promptsI18n : undefined,
    models: assistant.models.length > 0 ? assistant.models : undefined,
  } as AcpBackendConfig;
}

/**
 * Hook that loads the assistant catalog (backend-merged builtin + user + extension)
 * plus any user-defined custom ACP agents from ConfigStorage.
 */
export const useCustomAgentsLoader = ({
  availableCustomAgentIds,
}: UseCustomAgentsLoaderOptions): UseCustomAgentsLoaderResult => {
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);

  const customAgentAvatarMap = useMemo(() => {
    return new Map(customAgents.map((agent) => [agent.id, agent.avatar]));
  }, [customAgents]);

  const loadCustomAgents = useCallback(async () => {
    try {
      const [assistants, userCustomAgents] = await Promise.all([
        ipcBridge.assistants.list.invoke().catch(() => [] as Assistant[]),
        ConfigStorage.get('acp.customAgents'),
      ]);
      const list: AcpBackendConfig[] = [
        ...assistants.map(assistantToAcpBackendConfig),
        ...((userCustomAgents || []) as AcpBackendConfig[]).filter((a) => availableCustomAgentIds.has(a.id)),
      ];
      setCustomAgents(list);
    } catch (error) {
      console.error('Failed to load custom agents:', error);
    }
  }, [availableCustomAgentIds]);

  // Initial load
  useEffect(() => {
    void loadCustomAgents();
  }, [loadCustomAgents]);

  const refreshCustomAgents = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate(DETECTED_AGENTS_SWR_KEY);
    } catch (error) {
      console.error('Failed to refresh custom agents:', error);
    }
    // Re-read backend + ConfigStorage so UI reflects any changes (e.g. presetAgentType switch)
    await loadCustomAgents();
  }, [loadCustomAgents]);

  useEffect(() => {
    void refreshCustomAgents();
  }, [refreshCustomAgents]);

  return {
    customAgents,
    customAgentAvatarMap,
    refreshCustomAgents,
  };
};
