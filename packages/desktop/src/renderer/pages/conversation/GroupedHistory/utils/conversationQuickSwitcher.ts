/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import type { GroupedHistoryResult } from '../types';

export const MAX_RECENT_CONVERSATIONS = 8;

export const getRecentConversations = (
  { pinnedConversations, timelineSections }: GroupedHistoryResult,
  limit = MAX_RECENT_CONVERSATIONS
): TChatConversation[] => {
  if (limit <= 0) return [];

  const conversations = new Map<string, TChatConversation>();
  const addConversation = (conversation: TChatConversation) => {
    conversations.set(conversation.id, conversation);
  };

  pinnedConversations.forEach(addConversation);
  timelineSections.forEach((section) => {
    section.items.forEach((item) => {
      if (item.type === 'conversation' && item.conversation) {
        addConversation(item.conversation);
        return;
      }

      item.workspaceGroup?.conversations.forEach(addConversation);
    });
  });

  return [...conversations.values()]
    .toSorted((left, right) => getActivityTime(right) - getActivityTime(left))
    .slice(0, limit);
};

export const moveQuickSwitcherSelection = (currentIndex: number, direction: -1 | 1, itemCount: number): number => {
  if (itemCount <= 0) return -1;
  const validIndex = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : 0;
  return (validIndex + direction + itemCount) % itemCount;
};
