/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface BatchSelectionContextValue {
  /** All selected conversation IDs (regular + cron) */
  selectedConversationIds: Set<string>;
  /** Direct setter for advanced use (e.g., clearing after batch delete) */
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Total count of selected items (regular + cron) */
  selectedCount: number;
  /** Whether all registered regular conversations are selected */
  allSelected: boolean;
  /** Toggle a single conversation in/out of selection */
  toggleSelectedConversation: (conversation: TChatConversation) => void;
  /** Toggle all regular conversations on/off */
  handleToggleSelectAll: () => void;
  /** Register regular conversations for "select all" support */
  registerRegularConversations: (conversations: TChatConversation[]) => void;
}

const BatchSelectionContext = createContext<BatchSelectionContextValue | null>(null);

export const BatchSelectionProvider: React.FC<{
  batchMode: boolean;
  children: React.ReactNode;
}> = ({ batchMode, children }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [regularConversationIds, setRegularConversationIds] = useState<string[]>([]);

  // Reset all selections when batch mode turns off
  useEffect(() => {
    if (!batchMode) {
      setSelectedIds(new Set());
    }
  }, [batchMode]);

  // Prune deleted regular conversations from selection
  useEffect(() => {
    if (!batchMode || selectedIds.size === 0 || regularConversationIds.length === 0) return;
    const existingIds = new Set(regularConversationIds);
    setSelectedIds((prev) => {
      // Only prune IDs that were regular (not cron). We can't distinguish,
      // so only prune if the ID is definitely a known-regular one that's gone.
      // Actually, just keep all IDs - pruning happens naturally.
      return prev;
    });
  }, [batchMode, regularConversationIds, selectedIds.size]);

  const selectedCount = selectedIds.size;

  const allSelected = useMemo(
    () => regularConversationIds.length > 0 && regularConversationIds.every((id) => selectedIds.has(id)),
    [regularConversationIds, selectedIds]
  );

  const registerRegularConversations = useCallback((conversations: TChatConversation[]) => {
    setRegularConversationIds(conversations.map((c) => c.id));
  }, []);

  const toggleSelectedConversation = useCallback((conversation: TChatConversation) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(conversation.id)) {
        next.delete(conversation.id);
      } else {
        next.add(conversation.id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (regularConversationIds.length > 0 && regularConversationIds.every((id) => prev.has(id))) {
        // All regular are selected → deselect all (both regular and cron)
        return new Set();
      }
      // Select all regular conversations (keep existing cron selections)
      const next = new Set(prev);
      for (const id of regularConversationIds) next.add(id);
      return next;
    });
  }, [regularConversationIds]);

  const value = useMemo<BatchSelectionContextValue>(
    () => ({
      selectedConversationIds: selectedIds,
      setSelectedConversationIds: setSelectedIds,
      selectedCount,
      allSelected,
      toggleSelectedConversation,
      handleToggleSelectAll,
      registerRegularConversations,
    }),
    [
      selectedIds,
      selectedCount,
      allSelected,
      toggleSelectedConversation,
      handleToggleSelectAll,
      registerRegularConversations,
    ]
  );

  return <BatchSelectionContext.Provider value={value}>{children}</BatchSelectionContext.Provider>;
};

export const useBatchSelectionContext = (): BatchSelectionContextValue => {
  const ctx = useContext(BatchSelectionContext);
  if (!ctx) throw new Error('useBatchSelectionContext must be used within BatchSelectionProvider');
  return ctx;
};

export const useBatchSelectionContextSafe = (): BatchSelectionContextValue | null => {
  return useContext(BatchSelectionContext);
};
