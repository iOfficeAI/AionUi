/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendConfig } from '../types';
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
 * Hook that loads custom agents from ConfigStorage and ipcBridge.
 * Handles both user-created custom agents and extension-contributed assistants.
 */
export const useCustomAgentsLoader = ({
  availableCustomAgentIds,
}: UseCustomAgentsLoaderOptions): UseCustomAgentsLoaderResult => {
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);

  const customAgentAvatarMap = useMemo(() => {
    return new Map(customAgents.map((agent) => [agent.id, agent.avatar]));
  }, [customAgents]);

  // Load custom agents + extension-contributed assistants
  useEffect(() => {
    let isActive = true;
    Promise.all([
      ConfigStorage.get('acp.customAgents'),
      ipcBridge.extensions.getAssistants.invoke().catch(() => [] as Record<string, unknown>[]),
    ])
      .then(([agents, extAssistants]) => {
        if (!isActive) return;
        const list = (agents || []).filter((agent: AcpBackendConfig) => {
          // Keep preset assistants visible on Guid homepage even when ACP detection
          // has not produced custom IDs yet (startup race / transient detection failure).
          if (agent.isPreset) return true;
          return availableCustomAgentIds.has(agent.id);
        });

        // Merge extension-contributed assistants (they are preset assistants that don't need
        // to be in availableCustomAgentIds because they use existing backends like gemini/claude)
        for (const ext of extAssistants) {
          const id = typeof ext.id === 'string' ? ext.id : '';
          if (!id || list.some((a) => a.id === id)) continue;
          list.push({
            id,
            name: typeof ext.name === 'string' ? ext.name : id,
            nameI18n: ext.nameI18n as Record<string, string> | undefined,
            avatar: typeof ext.avatar === 'string' ? ext.avatar : undefined,
            isPreset: true,
            enabled: true,
            presetAgentType: typeof ext.presetAgentType === 'string' ? ext.presetAgentType : undefined,
            context: typeof ext.context === 'string' ? ext.context : undefined,
            contextI18n: ext.contextI18n as Record<string, string> | undefined,
            enabledSkills: Array.isArray(ext.enabledSkills) ? (ext.enabledSkills as string[]) : undefined,
            prompts: Array.isArray(ext.prompts) ? (ext.prompts as string[]) : undefined,
            promptsI18n: ext.promptsI18n as Record<string, string[]> | undefined,
          } as AcpBackendConfig);
        }

        setCustomAgents(list);
      })
      .catch((error) => {
        console.error('Failed to load custom agents:', error);
      });
    return () => {
      isActive = false;
    };
  }, [availableCustomAgentIds]);

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
    customAgents,
    customAgentAvatarMap,
    refreshCustomAgents,
  };
};
