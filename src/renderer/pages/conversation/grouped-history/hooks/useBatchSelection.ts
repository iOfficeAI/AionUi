/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

export const useBatchSelection = (batchMode: boolean, conversations: TChatConversation[]) => {
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());

  // Reset selection when batch mode is turned off
  useEffect(() => {
    if (!batchMode) {
      setSelectedConversationIds(new Set());
    }
  }, [batchMode]);

  // Remove selections for deleted conversations
  useEffect(() => {
    if (!batchMode || selectedConversationIds.size === 0) return;
    const existingIds = new Set(conversations.map((conversation) => conversation.id));
    setSelectedConversationIds((prev) => {
      const next = new Set<string>();
      prev.forEach((conversationId) => {
        if (existingIds.has(conversationId)) {
          next.add(conversationId);
        }
      });
      return next;
    });
  }, [batchMode, conversations, selectedConversationIds.size]);

  const allConversationIds = useMemo(() => conversations.map((conversation) => conversation.id), [conversations]);
  const selectedCount = selectedConversationIds.size;
  const allSelected = allConversationIds.length > 0 && selectedCount === allConversationIds.length;

  const toggleSelectedConversation = useCallback((conversation: TChatConversation) => {
    setSelectedConversationIds((prev) => {
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
    setSelectedConversationIds((prev) => {
      if (prev.size === allConversationIds.length) {
        return new Set();
      }
      return new Set(allConversationIds);
    });
  }, [allConversationIds]);

  return {
    selectedConversationIds,
    setSelectedConversationIds,
    selectedCount,
    allSelected,
    toggleSelectedConversation,
    handleToggleSelectAll,
  };
};
