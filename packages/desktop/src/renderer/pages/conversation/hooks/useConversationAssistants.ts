/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { useAssistantOrder } from '@/renderer/hooks/assistant/useAssistantOrder';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';

export type UseConversationAssistantsResult = {
  presetAssistants: Assistant[];
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export const useConversationAssistants = (): UseConversationAssistantsResult => {
  const { assistantOrder } = useAssistantOrder();
  const { data: assistants, isLoading } = useSWR('assistants.list', async () => {
    try {
      return await ipcBridge.assistants.list.invoke();
    } catch (error) {
      console.error('Failed to load assistants for conversation flows:', error);
      return [] as Assistant[];
    }
  });

  // Memoize the selectable list so effects depending on `presetAssistants`
  // don't re-fire on every render. SWR returns the same `assistants`
  // reference between renders, so the memo only recomputes on real updates.
  // The enabled-order preference is shared with settings, Guid, teams, and
  // scheduled tasks. Without one, `selectableAssistants` preserves the legacy
  // CLI → user → official ordering.
  const presetAssistants = useMemo(
    () => selectableAssistants(assistants ?? [], assistantOrder),
    [assistantOrder, assistants]
  );

  return {
    presetAssistants,
    isLoading,
    refresh: async () => {
      await mutate('assistants.list');
    },
  };
};
