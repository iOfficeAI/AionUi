/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The one drag-and-drop context for sidebar conversations.
 *
 * It sits above the Layout so a row picked up in the sidebar can land on
 * another row, on a split-group pill, or on the open chat area — the last one
 * is rendered by a different route, so a context scoped to the sidebar could
 * not see it. What a drop *means* is decided by the pure resolver in
 * `utils/conversationDropTargets`; this file only measures where the pointer
 * is, keeps the live drop target for the highlights, and carries out the
 * chosen action.
 *
 * The dragged row itself stays in place at reduced opacity; the ghost that
 * follows the pointer is the DragOverlay below, portalled to the body so the
 * sidebar's scroll container cannot clip it on the way to the chat area.
 */

import type { TChatConversation } from '@/common/config/storage';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import ConversationLeadingIcon from '../ConversationLeadingIcon';
import type { ConversationDropTarget, DropIntent } from '../utils/conversationDropTargets';
import { resolveConversationDropAction, resolveDropIntent } from '../utils/conversationDropTargets';
import { usePinnedReorder } from './useDragAndDrop';
import { useSplitGroupMutations } from './useSplitGroupMutations';

export type ConversationDropTargetState = {
  /** The droppable id under the pointer. */
  id: string;
  intent: DropIntent;
} | null;

export type ConversationDragValue = {
  /** The conversation being dragged, or null when nothing is. */
  activeConversation: TChatConversation | null;
  dropTarget: ConversationDropTargetState;
};

const idleValue: ConversationDragValue = { activeConversation: null, dropTarget: null };

const ConversationDragContext = createContext<ConversationDragValue>(idleValue);

/** Live drag state for highlights. Safe to call with no provider above (nothing is ever dragged). */
export const useConversationDrag = (): ConversationDragValue => useContext(ConversationDragContext);

/** Prefer the droppable under the pointer; fall back to the nearest one for the gaps between rows. */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

const ConversationDragGhost: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => (
  <div className='flex items-center gap-8px h-34px ps-10px pe-14px rd-8px bg-2 shadow-lg border border-solid border-b-base max-w-260px cursor-grabbing'>
    <span className='size-22px flex items-center justify-center shrink-0'>
      <ConversationLeadingIcon conversation={conversation} />
    </span>
    <span className='text-14px font-[500] text-t-primary truncate'>{conversation.name}</span>
  </div>
);

export const ConversationDragProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const {
    conversations,
    groupedHistory: { pinnedConversations, splitGroups },
  } = useConversationHistoryContext();
  const { reorderPinned } = usePinnedReorder();
  const { createGroup, addMember } = useSplitGroupMutations();
  const [activeConversation, setActiveConversation] = useState<TChatConversation | null>(null);
  const [dropTarget, setDropTarget] = useState<ConversationDropTargetState>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const pinnedIds = useMemo(() => pinnedConversations.map((conversation) => conversation.id), [pinnedConversations]);

  const resolveOver = useCallback(
    (
      event: DragMoveEvent | DragEndEvent
    ): { id: string; target: ConversationDropTarget; intent: DropIntent } | null => {
      const { over, active } = event;
      const target = over?.data.current as ConversationDropTarget | undefined;
      if (!over || !target?.kind) return null;

      let intent: DropIntent = 'onto';
      if (target.kind === 'conversation' && target.surface === 'row') {
        const origin = getEventCoordinates(event.activatorEvent);
        const pointerY = (origin?.y ?? over.rect.top) + event.delta.y;
        intent = resolveDropIntent({
          pointerY,
          targetTop: over.rect.top,
          targetHeight: over.rect.height,
          canReorder: pinnedIds.includes(String(active.id)) && pinnedIds.includes(target.conversation_id),
        });
      }
      return { id: String(over.id), target, intent };
    },
    [pinnedIds]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      setActiveConversation(conversations.find((conversation) => conversation.id === id) ?? null);
      setDropTarget(null);
    },
    [conversations]
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const resolved = resolveOver(event);
      setDropTarget((previous) => {
        if (!resolved) return previous === null ? previous : null;
        if (previous && previous.id === resolved.id && previous.intent === resolved.intent) return previous;
        return { id: resolved.id, intent: resolved.intent };
      });
    },
    [resolveOver]
  );

  const reset = useCallback(() => {
    setActiveConversation(null);
    setDropTarget(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      reset();
      const resolved = resolveOver(event);
      if (!resolved) return;

      const dragged_id = String(event.active.id);
      const action = resolveConversationDropAction({
        dragged_id,
        target: resolved.target,
        intent: resolved.intent,
        groups: splitGroups,
        pinnedIds,
      });
      // A drop on the open chat area is the user asking to see the columns;
      // a drop in the sidebar only builds the pill and leaves the view alone.
      const open = resolved.target.kind === 'conversation' && resolved.target.surface === 'chat';

      switch (action.type) {
        case 'reorder-pinned':
          void reorderPinned(action.active_id, action.over_id);
          return;
        case 'create-group':
          void createGroup(action.target_id, action.dragged_id, { open });
          return;
        case 'add-member': {
          const group = splitGroups.find((candidate) => candidate.id === action.group_id);
          if (group) void addMember(group, action.dragged_id, { open });
          return;
        }
        case 'none':
          if (action.reason !== 'self' && action.reason !== 'between') {
            console.warn(`[SplitGroup] Ignored a drop of ${dragged_id}: ${action.reason}.`);
          }
      }
    },
    [addMember, createGroup, pinnedIds, reorderPinned, reset, resolveOver, splitGroups]
  );

  const value = useMemo<ConversationDragValue>(
    () => ({ activeConversation, dropTarget }),
    [activeConversation, dropTarget]
  );

  return (
    <ConversationDragContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={reset}
      >
        {children}
        {typeof document !== 'undefined' &&
          createPortal(
            <DragOverlay dropAnimation={null} zIndex={1000}>
              {activeConversation && <ConversationDragGhost conversation={activeConversation} />}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    </ConversationDragContext.Provider>
  );
};
