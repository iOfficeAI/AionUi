/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { TimelineSection, WorkspaceGroup } from '../types';
import { isConversationPinned } from '../utils/groupingHelpers';
import { assignInitialSortOrders, computeSortOrder, getConversationSortOrder, needsReindex, reindexSortOrders } from '../utils/sortOrderHelpers';

type UseDragAndDropParams = {
  conversations: TChatConversation[];
  pinnedConversations: TChatConversation[];
  timelineSections: TimelineSection[];
  batchMode: boolean;
  collapsed: boolean;
};

type ActiveDragItem = {
  type: 'conversation' | 'workspace';
  id: string;
  conversation?: TChatConversation;
  workspaceGroup?: WorkspaceGroup;
  sourceSection: string;
  sourceWorkspace?: string;
};

export const useDragAndDrop = ({ conversations, pinnedConversations, timelineSections, batchMode, collapsed }: UseDragAndDropParams) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ActiveDragItem | null>(null);
  const isDraggingRef = useRef(false);

  const isDragEnabled = !batchMode && !collapsed && !isMobile;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Build a lookup map: conversationId -> { section, workspace? }
  const locationMap = useMemo(() => {
    const map = new Map<string, { section: string; workspace?: string }>();

    pinnedConversations.forEach((conv) => {
      map.set(conv.id, { section: 'pinned' });
    });

    timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'conversation' && item.conversation) {
          map.set(item.conversation.id, { section: section.timeline });
        }
        if (item.type === 'workspace' && item.workspaceGroup) {
          const wsId = `workspace:${item.workspaceGroup.workspace}`;
          map.set(wsId, { section: section.timeline });
          item.workspaceGroup.conversations.forEach((conv) => {
            map.set(conv.id, { section: section.timeline, workspace: item.workspaceGroup!.workspace });
          });
        }
      });
    });

    return map;
  }, [pinnedConversations, timelineSections]);

  // Find conversation by id across all data
  const findConversation = useCallback(
    (id: string): TChatConversation | undefined => {
      return conversations.find((c) => c.id === id);
    },
    [conversations]
  );

  // Find workspace group by workspace id (prefixed with "workspace:")
  const findWorkspaceGroup = useCallback(
    (id: string): WorkspaceGroup | undefined => {
      if (!id.startsWith('workspace:')) return undefined;
      const workspace = id.slice('workspace:'.length);
      for (const section of timelineSections) {
        for (const item of section.items) {
          if (item.type === 'workspace' && item.workspaceGroup?.workspace === workspace) {
            return item.workspaceGroup;
          }
        }
      }
      return undefined;
    },
    [timelineSections]
  );

  // Get sorted list of items in a specific context for sortOrder computation
  const getContextItems = useCallback(
    (itemId: string): Array<{ id: string; sortOrder?: number }> => {
      const location = locationMap.get(itemId);
      if (!location) return [];

      // Pinned section
      if (location.section === 'pinned') {
        return pinnedConversations.map((c) => ({
          id: c.id,
          sortOrder: getConversationSortOrder(c),
        }));
      }

      // Workspace internal
      if (location.workspace) {
        for (const section of timelineSections) {
          for (const item of section.items) {
            if (item.type === 'workspace' && item.workspaceGroup?.workspace === location.workspace) {
              return item.workspaceGroup.conversations.map((c) => ({
                id: c.id,
                sortOrder: getConversationSortOrder(c),
              }));
            }
          }
        }
        return [];
      }

      // Timeline section top-level items
      for (const section of timelineSections) {
        if (section.timeline === location.section) {
          return section.items.map((item) => {
            if (item.type === 'conversation' && item.conversation) {
              return { id: item.conversation.id, sortOrder: getConversationSortOrder(item.conversation) };
            }
            if (item.type === 'workspace' && item.workspaceGroup) {
              return { id: `workspace:${item.workspaceGroup.workspace}`, sortOrder: undefined };
            }
            return { id: '', sortOrder: undefined };
          }).filter((i) => i.id !== '');
        }
      }
      return [];
    },
    [locationMap, pinnedConversations, timelineSections]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const id = String(active.id);
      setActiveId(id);
      isDraggingRef.current = true;

      const location = locationMap.get(id);
      if (!location) return;

      if (id.startsWith('workspace:')) {
        const group = findWorkspaceGroup(id);
        setActiveItem({
          type: 'workspace',
          id,
          workspaceGroup: group,
          sourceSection: location.section,
        });
      } else {
        const conv = findConversation(id);
        setActiveItem({
          type: 'conversation',
          id,
          conversation: conv,
          sourceSection: location.section,
          sourceWorkspace: location.workspace,
        });
      }
    },
    [locationMap, findConversation, findWorkspaceGroup]
  );

  const persistSortOrder = useCallback(
    async (conversationId: string, sortOrder: number, extraUpdates?: Record<string, unknown>) => {
      try {
        await ipcBridge.conversation.update.invoke({
          id: conversationId,
          updates: {
            extra: {
              sortOrder,
              ...extraUpdates,
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          mergeExtra: true,
        });
      } catch (error) {
        console.error('[DragAndDrop] Failed to persist sort order:', error);
      }
    },
    []
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setActiveItem(null);
      isDraggingRef.current = false;

      if (!over || active.id === over.id) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      const activeLocation = locationMap.get(activeIdStr);
      const overLocation = locationMap.get(overIdStr);

      if (!activeLocation || !overLocation) return;

      // Constraint: workspace-internal conversations can only move within their workspace
      if (activeLocation.workspace) {
        if (overLocation.workspace !== activeLocation.workspace) {
          return;
        }
      }

      // Handle drag between pinned and non-pinned sections
      const movingToPinned = overLocation.section === 'pinned' && activeLocation.section !== 'pinned';
      const movingFromPinned = activeLocation.section === 'pinned' && overLocation.section !== 'pinned';

      // Get context items for the target location
      const targetItems = getContextItems(overIdStr);
      const itemsWithOrder = assignInitialSortOrders(targetItems);

      const oldIndex = itemsWithOrder.findIndex((i) => i.id === activeIdStr);
      const newIndex = itemsWithOrder.findIndex((i) => i.id === overIdStr);

      if (newIndex === -1) return;

      // Calculate new sortOrder
      let newSortOrder: number;
      if (oldIndex !== -1) {
        // Same context: reorder
        const reordered = arrayMove(itemsWithOrder, oldIndex, newIndex);
        const before = newIndex > 0 ? reordered[newIndex - 1].sortOrder : undefined;
        const after = newIndex < reordered.length - 1 ? reordered[newIndex + 1].sortOrder : undefined;
        newSortOrder = computeSortOrder(before, after);

        // Check if reindex needed
        if (needsReindex(reordered.map((i, idx) => ({ sortOrder: i.id === activeIdStr ? newSortOrder : i.sortOrder })))) {
          const finalOrder = reordered.map((i) => ({
            id: i.id,
            sortOrder: i.id === activeIdStr ? newSortOrder : i.sortOrder,
          }));
          const reindexed = reindexSortOrders(finalOrder);
          await Promise.all(reindexed.map((item) => persistSortOrder(item.id, item.sortOrder)));
          emitter.emit('chat.history.refresh');
          return;
        }
      } else {
        // Moving to a new context (e.g., pin/unpin)
        const before = newIndex > 0 ? itemsWithOrder[newIndex - 1].sortOrder : undefined;
        const after = newIndex < itemsWithOrder.length ? itemsWithOrder[newIndex].sortOrder : undefined;
        newSortOrder = computeSortOrder(before, after);
      }

      // Persist with pin/unpin changes if needed
      const extraUpdates: Record<string, unknown> = {};
      if (movingToPinned) {
        extraUpdates.pinned = true;
        extraUpdates.pinnedAt = Date.now();
      } else if (movingFromPinned) {
        extraUpdates.pinned = false;
        extraUpdates.pinnedAt = undefined;
      }

      await persistSortOrder(activeIdStr, newSortOrder, extraUpdates);
      emitter.emit('chat.history.refresh');
    },
    [locationMap, getContextItems, persistSortOrder]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setActiveItem(null);
    isDraggingRef.current = false;
  }, []);

  return {
    sensors,
    activeId,
    activeItem,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    isDragEnabled,
    findConversation,
    findWorkspaceGroup,
  };
};
