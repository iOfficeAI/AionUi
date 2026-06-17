/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';

export type UseConversationAssistantsResult = {
  presetAssistants: Assistant[];
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export const useConversationAssistants = (): UseConversationAssistantsResult => {
  const { data: assistants, isLoading } = useSWR('assistants.list', async () => {
    try {
      return await ipcBridge.assistants.list.invoke();
    } catch (error) {
      console.error('Failed to load assistants for conversation flows:', error);
      return [] as Assistant[];
    }
  });

  // Memoize the filtered list so effects depending on `presetAssistants`
  // don't re-fire on every render. SWR returns the same `assistants`
  // reference between renders, so the memo only recomputes on real updates.
  const presetAssistants = useMemo(
    () => (assistants ?? []).filter((assistant) => assistant.enabled !== false),
    [assistants]
  );

  return {
    presetAssistants,
    isLoading,
    refresh: async () => {
      await mutate('assistants.list');
    },
  };
};
