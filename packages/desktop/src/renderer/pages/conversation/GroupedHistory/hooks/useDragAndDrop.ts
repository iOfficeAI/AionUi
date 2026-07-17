/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DragEndEvent } from '@dnd-kit/core';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback } from 'react';

import {
  assignInitialSortOrders,
  computeSortOrder,
  getConversationSortOrder,
  needsReindex,
  reindexSortOrders,
} from '../utils/sortOrderHelpers';

type UseDragAndDropParams = {
  pinnedConversations: TChatConversation[];
  batchMode: boolean;
  collapsed: boolean;
};

export const useDragAndDrop = ({ pinnedConversations, batchMode, collapsed }: UseDragAndDropParams) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  const isDragEnabled = !batchMode && !collapsed && !isMobile;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const persistSortOrder = useCallback(async (conversation_id: string, sortOrder: number) => {
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
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      // Build pinned items list with sort orders
      const items = pinnedConversations.map((c) => ({
        id: c.id,
        sortOrder: getConversationSortOrder(c),
      }));
      const itemsWithOrder = assignInitialSortOrders(items);

      const oldIndex = itemsWithOrder.findIndex((i) => i.id === activeIdStr);
      const newIndex = itemsWithOrder.findIndex((i) => i.id === overIdStr);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(itemsWithOrder, oldIndex, newIndex);
      const before = newIndex > 0 ? reordered[newIndex - 1].sortOrder : undefined;
      const after = newIndex < reordered.length - 1 ? reordered[newIndex + 1].sortOrder : undefined;
      const newSortOrder = computeSortOrder(before, after);

      // Check if reindex needed
      if (needsReindex(reordered.map((i) => ({ sortOrder: i.id === activeIdStr ? newSortOrder : i.sortOrder })))) {
        const finalOrder = reordered.map((i) => ({
          id: i.id,
          sortOrder: i.id === activeIdStr ? newSortOrder : i.sortOrder,
        }));
        const reindexed = reindexSortOrders(finalOrder);
        await Promise.all(reindexed.map((item) => persistSortOrder(item.id, item.sortOrder)));
        emitter.emit('chat.history.refresh');
        return;
      }

      await persistSortOrder(activeIdStr, newSortOrder);
      emitter.emit('chat.history.refresh');
    },
    [pinnedConversations, persistSortOrder]
  );

  return {
    sensors,
    handleDragEnd,
    isDragEnabled,
  };
};
