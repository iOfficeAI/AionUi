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
import { COLUMN_DRAG_IGNORE_SELECTOR } from '@/renderer/pages/conversation/hooks/chatColumnContext';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { previewScopeKey } from '@/renderer/pages/conversation/Preview/context/previewScope';
import { Tabs } from '@arco-design/web-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SplitGroupColumn } from './SplitGroupColumn';
import { SplitGroupColumnFrame } from './SplitGroupColumnFrame';
import styles from './SplitGroupView.module.css';
import { arrowStep, columnsRunRightToLeft, moveColumn, reorderColumns, resolveColumnDropIndex } from './columnReorder';

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
  startY: number;
  element: HTMLElement;
  active: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
  /** Drop the gesture where it stands: listeners, timer, capture and state. */
  cancel: () => void;
};

/** A point the pointer is at, in viewport coordinates. */
type Point = { x: number; y: number };

/** How long a reorder announcement stays in the live region before the next one may repeat it. */
const ANNOUNCEMENT_MS = 2000;
/** The gap between emptying the live region and saying the same words again, so they count as new. */
const ANNOUNCEMENT_REPEAT_MS = 50;

/**
 * A press that starts inside a text field is the field's own (typing,
 * selecting, placing the caret), and so is one on a control the header has
 * marked as its own — the minimap's search trigger. Neither becomes a drag,
 * so the click that ends it still reaches the control.
 */
const startsOnAnotherControl = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest(
    `input, textarea, select, [contenteditable]:not([contenteditable="false"]), ${COLUMN_DRAG_IGNORE_SELECTOR}`
  ) !== null;

/**
 * The columns in the order the group has them, and the reorder gesture over
 * them. A column is grabbed by its header ("the top") and dragged left or
 * right; a thin marker shows the slot it would take; on release the new order
 * is written onto every member's tag in one reconciled batch, so the sidebar
 * block, this view and every other window agree, and it survives a relaunch.
 * The columns move at once and the write lands behind; a refused write puts
 * them back to the order the group had last confirmed, and the queue has
 * already said why.
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
  const orderRef = useRef(order);
  orderRef.current = order;
  // The order the group last confirmed — what a refused write falls back to.
  const groupOrderRef = useRef(groupOrder);
  groupOrderRef.current = groupOrder;
  // Writes still out. While one is, the group's order is not followed: the
  // first of two quick reorders lands and comes back through the group before
  // the second has, and following it would put the columns back a step and
  // hand the next move a stale order. The last write to settle decides.
  const pendingWrites = useRef(0);
  useEffect(() => {
    if (pendingWrites.current > 0) return;
    // The ids themselves, not the key parsed back: an id is whatever the
    // backend minted, and the key only says whether the order changed.
    setOrder(groupOrderRef.current);
  }, [groupOrderKey]);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const frames = useRef(new Map<string, HTMLDivElement>());
  const registerFrame = useCallback((conversation_id: string, element: HTMLDivElement | null) => {
    if (element) frames.current.set(conversation_id, element);
    else frames.current.delete(conversation_id);
  }, []);

  // Each write is numbered; only the newest one may put the columns back when
  // it is refused, and it puts them back to the order the group has confirmed
  // since — not to the order this view had when the write left. An older
  // refusal under a newer optimistic order leaves that newer order to its own
  // write.
  const writeSerial = useRef(0);
  const commit = useCallback(
    async (next: string[]): Promise<{ landed: boolean; latest: boolean }> => {
      setOrder(next);
      const serial = ++writeSerial.current;
      pendingWrites.current += 1;
      let landed = false;
      try {
        // The queue runs writes one after another, in the order they were
        // asked; this only waits for its own.
        landed = await reorderMembers(group.id, next);
      } catch (error) {
        // The queue reports its own failures; this catches a throw before it.
        console.error('[SplitGroup] reorder columns failed:', error);
      } finally {
        pendingWrites.current -= 1;
      }
      // Writes settle in the order they were queued, but a caller must not
      // speak for an older one once a newer one is out. A landed last write
      // keeps its order on screen: the group comes back saying the same.
      const latest = serial === writeSerial.current;
      if (!landed && latest) setOrder(groupOrderRef.current);
      return { landed, latest };
    },
    [group.id, reorderMembers]
  );

  // A stale announcement must not swallow the next identical one: the same
  // words twice are one change to a live region, so the region empties first
  // — after a moment on its own, and at once when the same words come again.
  const spoken = useRef('');
  spoken.current = announcement;
  const republish = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((text: string) => {
    if (republish.current) clearTimeout(republish.current);
    if (spoken.current !== text) {
      setAnnouncement(text);
      return;
    }
    setAnnouncement('');
    republish.current = setTimeout(() => setAnnouncement(text), ANNOUNCEMENT_REPEAT_MS);
  }, []);
  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => setAnnouncement(''), ANNOUNCEMENT_MS);
    return () => clearTimeout(timer);
  }, [announcement]);
  useEffect(
    () => () => {
      if (republish.current) clearTimeout(republish.current);
    },
    []
  );

  /** Which way the columns run, read when it matters: the locale can change under an open split. */
  const rightToLeft = useCallback(() => (ref.current ? columnsRunRightToLeft(ref.current) : false), [ref]);

  /** The slot the dragged column would take with the pointer here; none while it is off the columns. */
  const slotAt = useCallback(
    (activeId: string, point: Point): number | null => {
      for (const [id, element] of frames.current) {
        const rect = element.getBoundingClientRect();
        if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) continue;
        return resolveColumnDropIndex({
          activeId,
          overId: id,
          pointerX: point.x,
          overLeft: rect.left,
          overWidth: rect.width,
          order: orderRef.current,
          rtl: rightToLeft(),
        });
      }
      return null;
    },
    [rightToLeft]
  );

  const drag = useRef<HeaderDrag | null>(null);
  const justDragged = useRef(false);
  const endDrag = useCallback(
    (point: Point | null) => {
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
      const slot = point === null ? null : slotAt(current.id, point);
      if (slot !== null) void commit(reorderColumns(orderRef.current, current.id, slot));
    },
    [commit, slotAt]
  );
  // The view may go while a pointer is down (the group dissolves, the route
  // changes): the window listeners, the hold timer and the capture go with
  // it. Nothing is rendered after this, so no state is touched.
  useEffect(() => () => drag.current?.cancel(), []);

  const handleHeaderPointerDown = useCallback(
    (conversation_id: string, event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.button !== 0) return;
      if (drag.current) return;
      if (startsOnAnotherControl(event.target)) return;
      const element = event.currentTarget;
      const current: HeaderDrag = {
        id: conversation_id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        element,
        active: false,
        holdTimer: null,
        cancel: () => {
          cleanup();
          if (current.active) {
            try {
              element.releasePointerCapture(current.pointerId);
            } catch {
              // Capture may already be gone.
            }
          }
          drag.current = null;
        },
      };
      drag.current = current;
      // Once a finger has the column, the page must not pan under it: the
      // header allows panning (`touch-action: manipulation`, so a swipe still
      // scrolls), and a pan that started after the hold would cancel the
      // pointer before the drop. The first touch move after the hold is the
      // one that decides, and it is told no.
      const keepFromPanning = (touch: TouchEvent) => {
        if (touch.cancelable) touch.preventDefault();
      };
      const activate = () => {
        if (drag.current !== current || current.active) return;
        current.active = true;
        try {
          element.setPointerCapture(current.pointerId);
        } catch {
          // The listeners are on the window, so the moves keep arriving either
          // way; capture only keeps them coming while the pointer leaves it.
        }
        if (event.pointerType === 'touch') window.addEventListener('touchmove', keepFromPanning, { passive: false });
        setDraggingId(current.id);
      };
      // On the window, not the header: before the drag is active nothing has
      // captured the pointer, and a header is narrow — the first move is often
      // already outside it.
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('touchmove', keepFromPanning);
        if (current.holdTimer) clearTimeout(current.holdTimer);
        if (!current.active) drag.current = null;
      };
      const onMove = (move: PointerEvent) => {
        if (drag.current !== current || move.pointerId !== current.pointerId) return;
        const moved = Math.hypot(move.clientX - current.startX, move.clientY - current.startY);
        if (!current.active) {
          if (move.pointerType === 'touch') {
            // A finger that moves during the hold, in any direction, is scrolling.
            if (moved > TOUCH_HOLD_TOLERANCE_PX) cleanup();
            return;
          }
          if (moved < DRAG_START_PX) return;
          activate();
        }
        move.preventDefault();
        const slot = slotAt(current.id, { x: move.clientX, y: move.clientY });
        setDropSlot((previous) => (previous === slot ? previous : slot));
      };
      const onUp = (up: PointerEvent) => {
        if (drag.current !== current || up.pointerId !== current.pointerId) return;
        cleanup();
        endDrag(up.type === 'pointerup' ? { x: up.clientX, y: up.clientY } : null);
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
    (conversation_id: string, toward: 'left' | 'right') => {
      // The pointer has the columns; the keyboard waits for it to let go.
      if (drag.current?.active) return;
      const next = moveColumn(orderRef.current, conversation_id, arrowStep(toward, rightToLeft()));
      if (next.join('|') === orderRef.current.join('|')) return;
      // Said once the write has landed, or refused: not before, and only for
      // the newest write — an older one settling after it has nothing to add.
      void commit(next).then(({ landed, latest }) => {
        if (!latest) return;
        announce(
          landed
            ? t('conversation.splitGroup.columnMoved', {
                position: next.indexOf(conversation_id) + 1,
                count: next.length,
              })
            : t('conversation.splitGroup.columnNotMoved')
        );
      });
    },
    [announce, commit, rightToLeft, t]
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
