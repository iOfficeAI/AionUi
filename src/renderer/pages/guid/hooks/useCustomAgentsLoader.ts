/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
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
 * Hook that loads custom agents from configService and ipcBridge.
 * Handles both user-created custom agents and extension-contributed assistants.
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
      const [presetAssistants, userCustomAgents, extAssistants] = await Promise.all([
        configService.get('assistants'),
        configService.get('acp.customAgents'),
        ipcBridge.extensions.getAssistants.invoke().catch(() => [] as Record<string, unknown>[]),
      ]);
      const list: AcpBackendConfig[] = [
        ...((presetAssistants || []) as AcpBackendConfig[]).filter((a) => a.is_preset),
        ...((userCustomAgents || []) as AcpBackendConfig[]).filter((a) => availableCustomAgentIds.has(a.id)),
      ];
      for (const ext of extAssistants) {
        const id = typeof ext.id === 'string' ? ext.id : '';
        if (!id || list.some((a) => a.id === id)) continue;
        list.push({
          id,
          name: typeof ext.name === 'string' ? ext.name : id,
          nameI18n: ext.nameI18n as Record<string, string> | undefined,
          avatar: typeof ext.avatar === 'string' ? ext.avatar : undefined,
          is_preset: true,
          enabled: true,
          presetAgentType: typeof ext.presetAgentType === 'string' ? ext.presetAgentType : undefined,
          context: typeof ext.context === 'string' ? ext.context : undefined,
          contextI18n: ext.contextI18n as Record<string, string> | undefined,
          enabled_skills: Array.isArray(ext.enabled_skills) ? (ext.enabled_skills as string[]) : undefined,
          prompts: Array.isArray(ext.prompts) ? (ext.prompts as string[]) : undefined,
          promptsI18n: ext.promptsI18n as Record<string, string[]> | undefined,
        } as AcpBackendConfig);
      }
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
    // Re-read configService so UI reflects any changes (e.g. presetAgentType switch)
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
