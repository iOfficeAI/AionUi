import { ipcBridge } from '@/common';
import { resolveLocaleKey } from '@/common/utils';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { reorderAssistantList } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssistantOrder } from './useAssistantOrder';

/**
 * Manages the assistant list: loading from backend, sorting, and tracking the
 * active selection. The backend returns a single ordered builtin + user catalog,
 * so no client-side merge logic is needed.
 */
export const useAssistantList = () => {
  const { i18n } = useTranslation();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const localeKey = resolveLocaleKey(i18n.language);
  const previousLocaleKeyRef = useRef(localeKey);
  const { assistantOrder, setAssistantOrder } = useAssistantOrder();

  const loadAssistants = useCallback(async () => {
    try {
      const list = await ipcBridge.assistants.list.invoke();
      setAssistants(list);
      setActiveAssistantId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (error) {
      console.error('Failed to load assistants:', error);
    }
  }, []);

  const reorderEnabledAssistants = useCallback(
    async (activeId: string, overId: string) => {
      const enabledAssistants = selectableAssistants(assistants, assistantOrder);
      const reorderedAssistants = reorderAssistantList(enabledAssistants, activeId, overId);
      if (reorderedAssistants === enabledAssistants) return;

      try {
        await setAssistantOrder(reorderedAssistants.map((assistant) => assistant.id));
      } catch (error) {
        console.error('Failed to reorder enabled assistants:', error);
        throw error;
      }
    },
    [assistantOrder, assistants, setAssistantOrder]
  );

  useEffect(() => {
    void loadAssistants();
  }, [loadAssistants]);

  useEffect(() => {
    const localeChanged = previousLocaleKeyRef.current !== localeKey;
    previousLocaleKeyRef.current = localeKey;

    if (!localeChanged) {
      return;
    }

    void loadAssistants();
  }, [loadAssistants, localeKey]);

  const activeAssistant = assistants.find((a) => a.id === activeAssistantId) ?? null;

  return {
    assistants,
    setAssistants,
    activeAssistantId,
    setActiveAssistantId,
    activeAssistant,
    loadAssistants,
    reorderEnabledAssistants,
    assistantOrder,
    setAssistantOrder,
    localeKey,
  };
};
