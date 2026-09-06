/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import ConversationLeadingIcon from '@/renderer/pages/conversation/GroupedHistory/ConversationLeadingIcon';
import { useSplitGroupMutations } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import type { SplitGroup } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';
import {
  setFocusedConversation,
  setFocusedProject,
  useFocusedConversationId,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { previewScopeKey } from '@/renderer/pages/conversation/Preview/context/previewScope';
import { Tabs } from '@arco-design/web-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SplitGroupColumn } from './SplitGroupColumn';
import { SplitGroupColumnFrame } from './SplitGroupColumnFrame';
import styles from './SplitGroupView.module.css';
import { moveColumn, reorderColumns, resolveColumnDropIndex } from './columnReorder';

const conversationWorkspace = (conversation: TChatConversation): string | null =>
  (conversation.extra as { workspace?: string } | undefined)?.workspace ?? null;

/**
 * The one line that says which split this is, in the same words the sidebar
 * block uses: the group's name and its size, or just its size while it is
 * unnamed. The app titles no route after its content — a single conversation
 * leaves the window saying "AionUi" — so this stays inside the view rather
 * than inventing a window-title mechanism the rest of the app does not have.
 */
const SplitGroupTitle: React.FC<{ group: SplitGroup }> = ({ group }) => {
  const { t } = useTranslation();
  const count = group.members.length;
  return (
    <div
      data-testid={`split-group-view-title-${group.id}`}
      className='shrink-0 flex items-center h-24px px-12px text-12px font-[600] lh-16px text-t-tertiary tracking-[0.04em] select-none truncate'
    >
      {group.name
        ? t('conversation.splitGroup.blockLabelNamed', { name: group.name, count })
        : t('conversation.splitGroup.blockLabel', { count })}
    </div>
  );
};

/**
 * An open split group: one live conversation per member. Desktop shows them
 * as resizable columns; a narrow viewport shows one at a time behind tabs.
 *
 * Focus: the column the user last clicked, derived by the focus store from
 * the mounted set (each column's ChatConversation registers itself and claims
 * focus on pointer-down). This view only names a starting column — the one a
 * pill icon asked for, else the first — and publishes the focused column's
 * project so the Explorer, the shared preview panel and "add to chat" follow
 * the focus across projects.
 */
export const SplitGroupView: React.FC<{
  group: SplitGroup;
  /** A member the sidebar asked to focus (a click on its row in the pill). */
  requestedFocus?: string;
  /** Changes with every request, so asking for the same member twice acts twice. */
  requestKey?: string;
}> = ({ group, requestedFocus, requestKey }) => {
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const focusedId = useFocusedConversationId();
  const { closePreviewIfScopeChanged } = usePreviewContext();
  const { markAsRead } = useCronJobsMap();

  const memberIds = group.members.map((member) => member.id);
  const memberKey = memberIds.join('|');
  const requested = requestedFocus && memberIds.includes(requestedFocus) ? requestedFocus : undefined;
  const startingId = requested ?? memberIds[0];

  // Mobile shows one column at a time, so the tab strip owns which one; the
  // focus store follows the mounted column rather than the other way round.
  // A pill icon can ask for another member while the route is already open.
  const [activeTab, setActiveTab] = useState(startingId);
  useEffect(() => {
    const ids = memberKey.split('|');
    setActiveTab((current) => (ids.includes(current) ? current : ids[0]));
  }, [memberKey]);
  useEffect(() => {
    if (requested) setActiveTab(requested);
  }, [requested, requestKey]);

  // Name the focused column only when the user asks: on opening the group
  // (the first member, or the one a pill icon named) and on a later pill
  // request. Membership changes never re-run this — the focus store keeps the
  // column the user last clicked while it is on screen and falls back on its
  // own when that column leaves — so removing a member before the focused one
  // cannot steal the focus (plan decision 2).
  const startingIdRef = useRef(startingId);
  startingIdRef.current = startingId;
  useLayoutEffect(() => {
    if (!isMobile) setFocusedConversation(startingIdRef.current);
  }, [group.id, isMobile]);
  useLayoutEffect(() => {
    if (!isMobile && requested) setFocusedConversation(requested);
  }, [requested, requestKey, isMobile]);
  useLayoutEffect(() => {
    if (isMobile) setFocusedConversation(activeTab);
  }, [activeTab, isMobile]);

  const focusedMember =
    group.members.find((member) => member.id === focusedId) ??
    group.members.find((member) => member.id === (isMobile ? activeTab : startingId)) ??
    group.members[0];

  // The focused column's project is the focused project: Explorer, preview
  // scope and add-to-chat all key off it, and groups may span projects.
  const focusedProjectId = focusedMember.project_id ?? null;
  useLayoutEffect(() => {
    setFocusedProject(focusedProjectId);
  }, [focusedProjectId]);

  useEffect(() => {
    closePreviewIfScopeChanged(previewScopeKey(focusedMember.project_id ?? null, conversationWorkspace(focusedMember)));
  }, [closePreviewIfScopeChanged, focusedMember]);

  if (isMobile) {
    const activeMember = group.members.find((member) => member.id === activeTab) ?? group.members[0];
    return (
      <div className='flex flex-col h-full min-h-0' data-testid={`split-group-view-${group.id}`} data-layout='tabs'>
        <SplitGroupTitle group={group} />
        <Tabs
          activeTab={activeMember.id}
          onChange={(member_id) => {
            // Only a shown member is read; the others wait for their tab.
            markAsRead(member_id);
            setActiveTab(member_id);
          }}
          size='small'
          type='line'
          className={`shrink-0 px-8px ${styles.tabs}`}
        >
          {group.members.map((member) => (
            <Tabs.TabPane
              key={member.id}
              title={
                <span className='flex items-center gap-6px max-w-140px'>
                  <ConversationLeadingIcon conversation={member} size={14} />
                  <span className='truncate'>{member.name}</span>
                </span>
              }
            />
          ))}
        </Tabs>
        <div className='flex-1 min-h-0 flex flex-col'>
          <SplitGroupColumn key={activeMember.id} group={group} member={activeMember} focused />
        </div>
      </div>
    );
  }

  return <SplitGroupColumns group={group} focusedId={focusedMember.id} />;
};

/**
 * The row's own width, measured before its children first paint (a column's
 * default width is a share of it) and tracked as the row resizes (the Explorer
 * column appearing beside it, the window changing). `null` until measured.
 */
const useMeasuredWidth = (): { ref: React.RefObject<HTMLDivElement | null>; width: number | null } => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.offsetWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === 'number' && next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};

/** A mouse drags after this many pixels; a click never moves that far. */
const DRAG_START_PX = 6;
/** A finger has to hold this long before it drags; a swipe scrolls instead. */
const TOUCH_HOLD_MS = 250;
const TOUCH_HOLD_TOLERANCE_PX = 5;

type HeaderDrag = {
  id: string;
  pointerId: number;
  startX: number;
  element: HTMLElement;
  active: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
};

/**
 * The columns in the order the group has them, and the reorder gesture over
 * them. A column is grabbed by its header ("the top") and dragged left or
 * right; a thin marker shows the slot it would take; on release the new order
 * is written onto every member's tag in one reconciled batch, so the sidebar
 * block, this view and every other window agree, and it survives a relaunch.
 * The columns move at once and the write lands behind; a refused write puts
 * them back and the queue has already said why.
 *
 * The gesture is the view's own pointer-capture drag, like the divider's
 * resize, rather than a second drag-and-drop context: every column holds the
 * chat area's drop zone, which is a droppable of the sidebar's drag provider,
 * and a nested context would take that zone for itself — the sidebar's rows
 * could no longer be dropped onto an open column, and the zone would sit in
 * the way of the column drop. One pointer, three listeners, no second context.
 */
const SplitGroupColumns: React.FC<{ group: SplitGroup; focusedId: string }> = ({ group, focusedId }) => {
  const { t } = useTranslation();
  const { ref, width: containerWidth } = useMeasuredWidth();
  const { reorderMembers } = useSplitGroupMutations();
  const groupOrder = group.members.map((member) => member.id);
  const groupOrderKey = groupOrder.join('|');
  const [order, setOrder] = useState<string[]>(groupOrder);
  useEffect(() => {
    setOrder(groupOrderKey.split('|'));
  }, [groupOrderKey]);
  const orderRef = useRef(order);
  orderRef.current = order;
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const frames = useRef(new Map<string, HTMLDivElement>());
  const registerFrame = useCallback((conversation_id: string, element: HTMLDivElement | null) => {
    if (element) frames.current.set(conversation_id, element);
    else frames.current.delete(conversation_id);
  }, []);

  const commit = useCallback(
    (next: string[]) => {
      setOrder(next);
      const members = group.members;
      void reorderMembers(group.id, next).then((landed) => {
        if (!landed) setOrder(members.map((member) => member.id));
      });
    },
    [group.id, group.members, reorderMembers]
  );

  /** The slot the dragged column would take with the pointer at this x. */
  const slotAt = useCallback((activeId: string, clientX: number): number | null => {
    for (const [id, element] of frames.current) {
      const rect = element.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right) continue;
      return resolveColumnDropIndex({
        activeId,
        overId: id,
        pointerX: clientX,
        overLeft: rect.left,
        overWidth: rect.width,
        order: orderRef.current,
      });
    }
    return null;
  }, []);

  const drag = useRef<HeaderDrag | null>(null);
  const justDragged = useRef(false);
  const endDrag = useCallback(
    (clientX: number | null) => {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      if (current.holdTimer) clearTimeout(current.holdTimer);
      if (!current.active) return;
      try {
        current.element.releasePointerCapture(current.pointerId);
      } catch {
        // Capture may already be gone.
      }
      setDraggingId(null);
      setDropSlot(null);
      // The click that ends a drag on the header is not a click on the title.
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
      const slot = clientX === null ? null : slotAt(current.id, clientX);
      if (slot !== null) commit(reorderColumns(orderRef.current, current.id, slot));
    },
    [commit, slotAt]
  );

  const handleHeaderPointerDown = useCallback(
    (conversation_id: string, event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.button !== 0) return;
      if (drag.current) return;
      const element = event.currentTarget;
      const current: HeaderDrag = {
        id: conversation_id,
        pointerId: event.pointerId,
        startX: event.clientX,
        element,
        active: false,
        holdTimer: null,
      };
      drag.current = current;
      const activate = () => {
        if (drag.current !== current || current.active) return;
        current.active = true;
        try {
          element.setPointerCapture(current.pointerId);
        } catch {
          // Without capture the header still receives moves while the pointer stays over it.
        }
        setDraggingId(current.id);
      };
      // On the window, not the header: before the drag is active nothing has
      // captured the pointer, and a header is narrow — the first move is often
      // already outside it.
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (current.holdTimer) clearTimeout(current.holdTimer);
        if (!current.active) drag.current = null;
      };
      const onMove = (move: PointerEvent) => {
        if (drag.current !== current || move.pointerId !== current.pointerId) return;
        const moved = Math.abs(move.clientX - current.startX);
        if (!current.active) {
          if (move.pointerType === 'touch') {
            // A finger that moves during the hold is scrolling, not dragging.
            if (moved > TOUCH_HOLD_TOLERANCE_PX) cleanup();
            return;
          }
          if (moved < DRAG_START_PX) return;
          activate();
        }
        move.preventDefault();
        const slot = slotAt(current.id, move.clientX);
        setDropSlot((previous) => (previous === slot ? previous : slot));
      };
      const onUp = (up: PointerEvent) => {
        if (drag.current !== current || up.pointerId !== current.pointerId) return;
        cleanup();
        endDrag(up.type === 'pointerup' ? up.clientX : null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      if (event.pointerType === 'touch') current.holdTimer = setTimeout(activate, TOUCH_HOLD_MS);
    },
    [endDrag, slotAt]
  );

  const handleHeaderClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!justDragged.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleMoveColumn = useCallback(
    (conversation_id: string, delta: -1 | 1) => {
      const next = moveColumn(orderRef.current, conversation_id, delta);
      if (next.join('|') === orderRef.current.join('|')) return;
      commit(next);
      setAnnouncement(
        t('conversation.splitGroup.columnMoved', { position: next.indexOf(conversation_id) + 1, count: next.length })
      );
    },
    [commit, t]
  );

  const members = order
    .map((id) => group.members.find((member) => member.id === id))
    .filter((member): member is TChatConversation => member !== undefined);
  const count = members.length;

  return (
    <div
      className='flex flex-col h-full w-full min-h-0'
      data-testid={`split-group-view-${group.id}`}
      data-layout='columns'
      data-column-order={order.join('|')}
      data-drop-slot={dropSlot ?? undefined}
    >
      <SplitGroupTitle group={group} />
      <span role='status' aria-live='polite' className='sr-only' data-testid={`split-group-reorder-status-${group.id}`}>
        {announcement}
      </span>
      <div ref={ref} className='flex flex-1 w-full min-h-0 overflow-x-auto overflow-y-hidden'>
        {containerWidth !== null &&
          members.map((member, index) => (
            <SplitGroupColumnFrame
              key={member.id}
              group={group}
              member={member}
              focused={member.id === focusedId}
              isLast={index === count - 1}
              containerWidth={containerWidth}
              columnCount={count}
              trailingCount={count - 1 - index}
              dropSlot={dropSlot}
              index={index}
              dragging={draggingId === member.id}
              onHeaderPointerDown={handleHeaderPointerDown}
              onHeaderClickCapture={handleHeaderClickCapture}
              onMoveColumn={handleMoveColumn}
              registerFrame={registerFrame}
            />
          ))}
      </div>
    </div>
  );
};

export default SplitGroupView;
