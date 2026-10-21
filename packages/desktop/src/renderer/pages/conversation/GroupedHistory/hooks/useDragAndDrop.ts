/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { arrayMove } from '@dnd-kit/sortable';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback } from 'react';

import {
  assignInitialSortOrders,
  computeSortOrder,
  getConversationSortOrder,
  needsReindex,
  reindexSortOrders,
} from '../utils/sortOrderHelpers';

const persistSortOrder = async (conversation_id: string, sortOrder: number): Promise<void> => {
  try {
    await ipcBridge.conversation.update.invoke({
      id: conversation_id,
      updates: {
        extra: {
          sortOrder,
        } as Partial<TChatConversation['extra']>,
      } as Partial<TChatConversation>,
      merge_extra: true,
    });
  } catch (error) {
    console.error('[DragAndDrop] Failed to persist sort order:', error);
  }
};

/**
 * Reorder the pinned section: move the dragged row into the dropped row's
 * slot and persist a fractional sort order (re-indexing the whole section when
 * neighbours get too close). The DndContext that feeds this lives in
 * ConversationDragContext, which also decides that a drop *between* two pinned
 * rows means reorder rather than fuse.
 */
export const usePinnedReorder = () => {
  const {
    groupedHistory: { pinnedConversations },
  } = useConversationHistoryContext();

  const reorderPinned = useCallback(
    async (active_id: string, over_id: string): Promise<void> => {
      if (active_id === over_id) return;

      // Build pinned items list with sort orders
      const items = pinnedConversations.map((c) => ({
        id: c.id,
        sortOrder: getConversationSortOrder(c),
      }));
      const itemsWithOrder = assignInitialSortOrders(items);

      const oldIndex = itemsWithOrder.findIndex((i) => i.id === active_id);
      const newIndex = itemsWithOrder.findIndex((i) => i.id === over_id);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(itemsWithOrder, oldIndex, newIndex);
      const before = newIndex > 0 ? reordered[newIndex - 1].sortOrder : undefined;
      const after = newIndex < reordered.length - 1 ? reordered[newIndex + 1].sortOrder : undefined;
      const newSortOrder = computeSortOrder(before, after);

      // Check if reindex needed
      if (needsReindex(reordered.map((i) => ({ sortOrder: i.id === active_id ? newSortOrder : i.sortOrder })))) {
        const finalOrder = reordered.map((i) => ({
          id: i.id,
          sortOrder: i.id === active_id ? newSortOrder : i.sortOrder,
        }));
        const reindexed = reindexSortOrders(finalOrder);
        await Promise.all(reindexed.map((item) => persistSortOrder(item.id, item.sortOrder)));
        emitter.emit('chat.history.refresh');
        return;
      }

      await persistSortOrder(active_id, newSortOrder);
      emitter.emit('chat.history.refresh');
    },
    [pinnedConversations]
  );

  return { reorderPinned };
};
