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

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import ConversationLeadingIcon from '../ConversationLeadingIcon';
import type { ConversationDropAction, ConversationDropTarget, DropIntent } from '../utils/conversationDropTargets';
import { pickRowInGap, resolveConversationDropAction, resolveDropIntent } from '../utils/conversationDropTargets';
import type { RowRect } from '../utils/conversationDropTargets';
import { readSplitGroupTag } from '../utils/splitGroupHelpers';
import { usePinnedReorder } from './useDragAndDrop';
import { useSplitGroupMutations } from './useSplitGroupMutations';

export type ConversationDropTargetState = {
  /** The droppable id under the pointer. */
  id: string;
  intent: DropIntent;
} | null;

/**
 * What releasing right now would do to a split-group member: shown on the
 * ghost that follows the pointer, so leaving a group — which highlights no
 * target of its own — is visible before the user lets go.
 */
export type ConversationDropHint = 'remove-member' | 'move-member' | null;

export type ConversationDragValue = {
  /** The conversation being dragged, or null when nothing is. */
  activeConversation: TChatConversation | null;
  dropTarget: ConversationDropTargetState;
  dropHint: ConversationDropHint;
};

const idleValue: ConversationDragValue = { activeConversation: null, dropTarget: null, dropHint: null };

const ConversationDragContext = createContext<ConversationDragValue>(idleValue);

/** Live drag state for highlights. Safe to call with no provider above (nothing is ever dragged). */
export const useConversationDrag = (): ConversationDragValue => useContext(ConversationDragContext);

/** Marks a collision that was picked for the pointer sitting in the gap beside its target. */
export const GAP_COLLISION = 'gap';

/**
 * The droppable under the pointer; failing that, the row-like target (a row
 * or a pill) the pointer is in the gap between, so a release between two
 * sidebar entries still reads as "between". A gap pick is marked as one on the
 * collision, so the drop can be read as "beside" rather than "onto" whatever
 * it is beside. Blank space is not a target: releasing there does nothing.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) return within;
  const pointer = args.pointerCoordinates;
  if (!pointer) return [];
  const rows: RowRect[] = [];
  for (const container of args.droppableContainers) {
    const target = container.data.current as ConversationDropTarget | undefined;
    const rect = args.droppableRects.get(container.id);
    const rowLike = target?.kind === 'split_group' || (target?.kind === 'conversation' && target.surface === 'row');
    if (!rect || !rowLike) continue;
    rows.push({ id: String(container.id), top: rect.top, height: rect.height, left: rect.left, width: rect.width });
  }
  const id = pickRowInGap(pointer, rows);
  if (id === null) return [];
  const container = args.droppableContainers.find((candidate) => String(candidate.id) === id);
  return container
    ? [{ id: container.id, data: { droppableContainer: container, value: 0, [GAP_COLLISION]: true } }]
    : [];
};

const ConversationDragGhost: React.FC<{ conversation: TChatConversation; hint?: string }> = ({
  conversation,
  hint,
}) => (
  <div className='flex flex-col gap-2px ps-10px pe-14px py-4px rd-8px bg-2 shadow-lg border border-solid border-b-base max-w-260px cursor-grabbing'>
    <div className='flex items-center gap-8px h-24px'>
      <span className='size-22px flex items-center justify-center shrink-0'>
        <ConversationLeadingIcon conversation={conversation} />
      </span>
      <span className='text-14px font-[500] text-t-primary truncate'>{conversation.name}</span>
    </div>
    {hint && (
      <span
        className='ps-30px text-11px lh-14px text-[rgb(var(--primary-6))] truncate'
        data-testid='conversation-drag-hint'
      >
        {hint}
      </span>
    )}
  </div>
);

export const ConversationDragProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation();
  const {
    conversations,
    groupedHistory: { pinnedConversations, splitGroups },
  } = useConversationHistoryContext();
  const { reorderPinned } = usePinnedReorder();
  const { createGroup, addMember, moveMember, removeMember, reconcileDeleted } = useSplitGroupMutations();

  // A member deleted anywhere (its own row menu, the archive page, another
  // device) reaches every window as a backend "deleted" event. Reconcile its
  // group from that event — never from the member merely missing from a list
  // snapshot — and only once the member's own read confirms it is gone.
  //
  // The group is resolved from every tag this window has ever seen, not from
  // the groups it can render right now: by the time the event arrives the row
  // is usually already out of the list (the refresh won the race, or the
  // delete came from another device), and a group derived only from loaded
  // members would no longer name it. Entries are never dropped, so a deletion
  // is still reconcilable after the row itself is gone.
  const groupIdByMemberRef = useRef(new Map<string, string>());
  useEffect(() => {
    for (const conversation of conversations) {
      const tag = readSplitGroupTag(conversation);
      if (tag) groupIdByMemberRef.current.set(conversation.id, tag.id);
    }
  }, [conversations]);

  const reconcileDeletedRef = useRef(reconcileDeleted);
  reconcileDeletedRef.current = reconcileDeleted;
  useEffect(() => {
    // Subscribed once for the window's lifetime: resubscribing on every list
    // change opens a gap that would swallow the very event this exists for.
    return ipcBridge.conversation.listChanged.on((event) => {
      if (event.action !== 'deleted') return;
      const group_id = groupIdByMemberRef.current.get(event.conversation_id);
      if (group_id) void reconcileDeletedRef.current(group_id, event.conversation_id);
    });
  }, []);
  const [activeConversation, setActiveConversation] = useState<TChatConversation | null>(null);
  const [dropTarget, setDropTarget] = useState<ConversationDropTargetState>(null);
  const [dropHint, setDropHint] = useState<ConversationDropHint>(null);

  // Two sensors, because a mouse and a finger need opposite rules. A mouse
  // drags once it has moved 8px, so a click stays a click. A finger has to
  // hold still for a moment first: the list scrolls by touch, and a swipe that
  // started on a handle must scroll, not drag. Movement during the hold cancels
  // the drag and lets the scroll through. This is what keeps drag available on
  // every device without hijacking the one gesture a touch screen needs most.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );
  const pinnedIds = useMemo(() => pinnedConversations.map((conversation) => conversation.id), [pinnedConversations]);

  const resolveOver = useCallback(
    (
      event: DragMoveEvent | DragEndEvent
    ): { id: string; target: ConversationDropTarget; intent: DropIntent; inGap: boolean } | null => {
      const { over, active } = event;
      const target = over?.data.current as ConversationDropTarget | undefined;
      if (!over || !target?.kind) return null;

      // Whether collision detection settled on this target for the pointer
      // being in the gap beside it, rather than over it. A gap is "between"
      // whatever it is beside — a plain row, a pill, a row inside one — so the
      // intent is decided before the target's kind is looked at.
      const inGap =
        event.collisions?.some((collision) => collision.id === over.id && collision.data?.[GAP_COLLISION] === true) ??
        false;
      let intent: DropIntent = 'onto';
      if (inGap || (target.kind === 'conversation' && target.surface === 'row')) {
        const origin = getEventCoordinates(event.activatorEvent);
        const pointerY = (origin?.y ?? over.rect.top) + event.delta.y;
        intent = resolveDropIntent({
          pointerY,
          targetTop: over.rect.top,
          targetHeight: over.rect.height,
          canReorder:
            target.kind === 'conversation' &&
            pinnedIds.includes(String(active.id)) &&
            pinnedIds.includes(target.conversation_id),
          inGap,
        });
      }
      return { id: String(over.id), target, intent, inGap };
    },
    [pinnedIds]
  );

  /** What releasing where the pointer is would do. `null` target means "over nothing". */
  const resolveAction = useCallback(
    (event: DragMoveEvent | DragEndEvent, resolved: ReturnType<typeof resolveOver>): ConversationDropAction =>
      resolveConversationDropAction({
        dragged_id: String(event.active.id),
        target: resolved?.target ?? null,
        intent: resolved?.intent ?? 'onto',
        inGap: resolved?.inGap ?? false,
        groups: splitGroups,
        pinnedIds,
      }),
    [pinnedIds, splitGroups]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      setActiveConversation(conversations.find((conversation) => conversation.id === id) ?? null);
      setDropTarget(null);
      setDropHint(null);
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
      const action = resolveAction(event, resolved);
      const hint: ConversationDropHint =
        action.type === 'remove-member' || action.type === 'move-member' ? action.type : null;
      setDropHint((previous) => (previous === hint ? previous : hint));
    },
    [resolveAction, resolveOver]
  );

  const reset = useCallback(() => {
    setActiveConversation(null);
    setDropTarget(null);
    setDropHint(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      reset();
      const resolved = resolveOver(event);
      const dragged_id = String(event.active.id);
      const action = resolveAction(event, resolved);
      // A drop on the open chat area is the user asking to see the columns;
      // a drop in the sidebar only builds the pill and leaves the view alone.
      const open = resolved?.target.kind === 'conversation' && resolved.target.surface === 'chat';

      switch (action.type) {
        case 'reorder-pinned':
          void reorderPinned(action.active_id, action.over_id);
          return;
        case 'create-group':
          void createGroup(action.target_id, action.dragged_id, { open });
          return;
        case 'add-member':
          void addMember(action.group_id, action.dragged_id, { open });
          return;
        case 'remove-member':
          void removeMember(action.group_id, action.dragged_id);
          return;
        case 'move-member':
          void moveMember(action.from_group_id, action.dragged_id, action.to, { open });
          return;
        case 'none':
          if (action.reason !== 'self' && action.reason !== 'between' && action.reason !== 'nowhere') {
            console.warn(`[SplitGroup] Ignored a drop of ${dragged_id}: ${action.reason}.`);
          }
      }
    },
    [addMember, createGroup, moveMember, removeMember, reorderPinned, reset, resolveAction, resolveOver]
  );

  const value = useMemo<ConversationDragValue>(
    () => ({ activeConversation, dropTarget, dropHint }),
    [activeConversation, dropHint, dropTarget]
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
              {activeConversation && (
                <ConversationDragGhost
                  conversation={activeConversation}
                  hint={
                    dropHint === 'remove-member'
                      ? t('conversation.splitGroup.dropToRemove')
                      : dropHint === 'move-member'
                        ? t('conversation.splitGroup.dropToMove')
                        : undefined
                  }
                />
              )}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    </ConversationDragContext.Provider>
  );
};
