/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DragEndEvent } from '@dnd-kit/core';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { ipcBridge } from '@/common';
import type { OrderItemType, SidebarItem } from '@/common/types/sidebar';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback } from 'react';

type OrderAnchor = { item_type: OrderItemType; item_id: string };

/**
 * Composite sortable id — `${item_type}:${item_id}` — so a conversation and a
 * team can never collide inside the shared pinned `SortableContext` (their id
 * spaces are independent). Both the sortable rows and the drag resolution below
 * key off this, so they stay in lockstep.
 */
export const sortableId = (item_type: OrderItemType, item_id: string): string => `${item_type}:${item_id}`;

/** Order anchor (type + id) for a pinned row, regardless of its kind. */
const anchorOf = (item: SidebarItem): OrderAnchor =>
  item.type === 'team'
    ? { item_type: 'team', item_id: item.team_id }
    : { item_type: 'conversation', item_id: item.conversation.id };

type UseDragAndDropParams = {
  /** The pinned group in backend order (conversation ∪ team) — the drag universe. */
  pinnedRows: SidebarItem[];
  batchMode: boolean;
  collapsed: boolean;
};

export const useDragAndDrop = ({ pinnedRows, batchMode, collapsed }: UseDragAndDropParams) => {
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

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      const anchors = pinnedRows.map(anchorOf);
      const ids = anchors.map((a) => sortableId(a.item_type, a.item_id));

      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const moved = anchors[oldIndex];
      const reordered = arrayMove(anchors, oldIndex, newIndex);
      // Anchor-only payload (BR-26): the moved item lands right after its new
      // predecessor; dropping at the very top sends `after: null`. The server owns
      // the numeric order key — the client never computes or sends one.
      const after = newIndex > 0 ? reordered[newIndex - 1] : null;

      try {
        await ipcBridge.order.pinned.move.invoke({ moved, after });
      } catch (error) {
        // Stale window: an anchor vanished server-side (400/404). Fall through to
        // the refresh below, which reconciles the list to server truth.
        console.error('[DragAndDrop] move failed, reconciling to server order:', error);
      }
      emitter.emit('chat.history.refresh');
    },
    [pinnedRows]
  );

  return {
    sensors,
    handleDragEnd,
    isDragEnabled,
  };
};
