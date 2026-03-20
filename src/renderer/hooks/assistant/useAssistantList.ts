import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';
import {
  isExtensionAssistant as isExtensionAssistantUtil,
  normalizeExtensionAssistants,
  sortAssistants as sortAssistantsUtil,
} from '@/renderer/pages/settings/AgentSettings/AssistantManagement/assistantUtils';
import type { AssistantListItem } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

/**
 * Manages the assistant list: loading, merging extension assistants,
 * sorting, and tracking the active selection.
 */
export const useAssistantList = () => {
  const { i18n } = useTranslation();
  const [assistants, setAssistants] = useState<AssistantListItem[]>([]);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const localeKey = resolveLocaleKey(i18n.language);

  // Load extension-contributed assistants for Settings > Assistants list
  const { data: extensionAssistants } = useSWR('extensions.assistants', () =>
    ipcBridge.extensions.getAssistants.invoke().catch(() => [] as Record<string, unknown>[])
  );

  const normalizedExtAssistants = React.useMemo<AssistantListItem[]>(
    () => normalizeExtensionAssistants(extensionAssistants || []),
    [extensionAssistants]
  );

  const isExtensionAssistant = useCallback(
    (assistant: AssistantListItem | null | undefined) => isExtensionAssistantUtil(assistant),
    []
  );

  const sortAssistants = useCallback((agents: AssistantListItem[]) => sortAssistantsUtil(agents), []);

  const loadAssistants = useCallback(async () => {
    try {
      // Read stored assistants from config (includes builtin and user-defined)
      const localAgents: AssistantListItem[] = (await ConfigStorage.get('acp.customAgents')) || [];

      const mergedAgents = [...localAgents];
      for (const extAssistant of normalizedExtAssistants) {
        if (!mergedAgents.some((agent) => agent.id === extAssistant.id)) {
          mergedAgents.push(extAssistant);
        }
      }

      const sortedAssistants = sortAssistants(mergedAgents);

      setAssistants(sortedAssistants);
      setActiveAssistantId((prev) => {
        if (prev && sortedAssistants.some((assistant) => assistant.id === prev)) return prev;
        return sortedAssistants[0]?.id || null;
      });
    } catch (error) {
      console.error('Failed to load assistant presets:', error);
    }
  }, [normalizedExtAssistants, sortAssistants]);

  useEffect(() => {
    void loadAssistants();
  }, [loadAssistants]);

  const activeAssistant = assistants.find((assistant) => assistant.id === activeAssistantId) || null;
  const isReadonlyAssistant = Boolean(activeAssistant && isExtensionAssistant(activeAssistant));

  return {
    assistants,
    setAssistants,
    activeAssistantId,
    setActiveAssistantId,
    activeAssistant,
    isReadonlyAssistant,
    isExtensionAssistant,
    loadAssistants,
    localeKey,
  };
};
