/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { SplitGroup } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';
import type { ColumnHeaderDragHandle } from '@/renderer/pages/conversation/hooks/chatColumnContext';
import { MIN_CHAT_PANEL_PX } from '@/renderer/pages/conversation/utils/layoutCalc';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SplitGroupColumn } from './SplitGroupColumn';

/** What a column frame registers with the view's drag context. */
export type ColumnDragData = { kind: 'split-column'; conversation_id: string };

const columnWidthStorageKey = (conversation_id: string): string => `split-column-width-${conversation_id}`;

const readStoredColumnWidth = (conversation_id: string): number | null => {
  try {
    const raw = localStorage.getItem(columnWidthStorageKey(conversation_id));
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

const writeStoredColumnWidth = (conversation_id: string, width: number | null): void => {
  try {
    if (width === null) localStorage.removeItem(columnWidthStorageKey(conversation_id));
    else localStorage.setItem(columnWidthStorageKey(conversation_id), String(Math.round(width)));
  } catch (error) {
    console.error('[SplitGroup] Failed to persist a column width:', error);
  }
};

/**
 * A desktop column's frame. Columns share the row equally until the user drags
 * a divider; from then on that column keeps the dragged width (remembered per
 * conversation) and the others share what is left. Double-clicking the divider
 * lets the column share again. Every column but the last owns the divider on
 * its right edge: a 1px line in the same token as the preview region's border,
 * always visible so each chat box reads as its own card, thickening under the
 * pointer because it is also the drag target. Below a comfortable minimum the
 * row scrolls sideways, like the Team view.
 *
 * The drag starts from the column's rendered width rather than from a stored
 * one: an unpinned column's width is whatever the flex share gives it at that
 * moment (it changes when the Explorer column opens beside the row), which is
 * why the shared `useResizableSplit` — whose state owns the width — does not
 * fit here.
 */
export const SplitGroupColumnFrame: React.FC<{
  group: SplitGroup;
  member: TChatConversation;
  focused: boolean;
  isLast: boolean;
  containerWidth: number;
  columnCount: number;
  /** Columns to the right of this one; each must keep its minimum width. */
  trailingCount: number;
  /**
   * Where a column being dragged would land, as the slot it takes: this
   * frame draws the marker on its left edge for its own slot, and the last
   * frame also draws it on its right edge for the slot after it.
   */
  dropSlot?: number | null;
  index: number;
  /** Alt+Arrow on the grip moves this column one slot. */
  onMoveColumn?: (conversation_id: string, delta: -1 | 1) => void;
}> = ({
  group,
  member,
  focused,
  isLast,
  containerWidth,
  columnCount: _columnCount,
  trailingCount,
  dropSlot = null,
  index,
  onMoveColumn,
}) => {
  const { t } = useTranslation();
  const maxWidth = Math.max(MIN_CHAT_PANEL_PX, Math.floor(containerWidth - MIN_CHAT_PANEL_PX * trailingCount));
  const frameRef = useRef<HTMLDivElement>(null);

  // The header is the drag source, the whole frame the drop target: the
  // column under the pointer decides which slot the marker shows, by halves.
  const dragData: ColumnDragData = useMemo(() => ({ kind: 'split-column', conversation_id: member.id }), [member.id]);
  const {
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({
    id: member.id,
    data: dragData,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: member.id, data: dragData });
  const headerDragHandle = useMemo<ColumnHeaderDragHandle>(
    () => ({
      setActivatorNodeRef,
      listeners: listeners as ColumnHeaderDragHandle['listeners'],
      isDragging,
      label: t('conversation.splitGroup.reorderHandle'),
      onKeyDown: (event) => {
        if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        event.stopPropagation();
        onMoveColumn?.(member.id, event.key === 'ArrowLeft' ? -1 : 1);
      },
    }),
    [isDragging, listeners, member.id, onMoveColumn, setActivatorNodeRef, t]
  );
  const setFrameRef = useCallback(
    (element: HTMLDivElement | null) => {
      frameRef.current = element;
      setDragRef(element);
      setDropRef(element);
    },
    [setDragRef, setDropRef]
  );
  const [pinnedWidth, setPinnedWidth] = useState<number | null>(() => readStoredColumnWidth(member.id));

  const handleDividerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'touch' && event.button !== 0) return;
      const frame = frameRef.current;
      if (!frame) return;
      event.preventDefault();
      const handle = event.currentTarget;
      const startX = event.clientX;
      const startWidth = frame.offsetWidth;
      let latest = startWidth;
      const clamp = (width: number) => Math.min(Math.max(width, MIN_CHAT_PANEL_PX), maxWidth);
      const onMove = (move: PointerEvent) => {
        latest = clamp(startWidth + (move.clientX - startX));
        setPinnedWidth(latest);
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        handle.removeEventListener('lostpointercapture', onUp);
        writeStoredColumnWidth(member.id, latest);
      };
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Without capture the handle still receives moves while the pointer stays over it.
      }
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
      handle.addEventListener('lostpointercapture', onUp);
    },
    [maxWidth, member.id]
  );

  const unpin = useCallback(() => {
    setPinnedWidth(null);
    writeStoredColumnWidth(member.id, null);
  }, [member.id]);

  const style: React.CSSProperties =
    !isLast && pinnedWidth !== null
      ? { flex: '0 0 auto', width: Math.min(Math.max(pinnedWidth, MIN_CHAT_PANEL_PX), maxWidth) }
      : { flex: '1 1 0px', minWidth: MIN_CHAT_PANEL_PX };

  // A 2px hairline in a primary wash at the slot the dragged column would
  // take — never a dark outline, never an accent bar.
  const marker = (edge: 'start' | 'end') => (
    <span
      aria-hidden='true'
      data-testid={`split-column-drop-marker-${member.id}-${edge}`}
      className={`pointer-events-none absolute top-8px bottom-8px w-2px rd-1px bg-[rgba(var(--primary-6),0.55)] z-40 ${
        edge === 'start' ? 'start-0' : 'end-0'
      }`}
    />
  );

  return (
    <div
      ref={setFrameRef}
      className='relative h-full shrink-0'
      style={{ ...style, opacity: isDragging ? 0.85 : undefined }}
      data-testid={`split-column-frame-${member.id}`}
      data-column-index={index}
    >
      <SplitGroupColumn group={group} member={member} focused={focused} headerDragHandle={headerDragHandle} />
      {dropSlot === index && marker('start')}
      {isLast && dropSlot === index + 1 && marker('end')}
      {!isLast && (
        <div
          role='separator'
          aria-orientation='vertical'
          data-testid={`split-column-divider-${member.id}`}
          className='group absolute top-0 bottom-0 end-0 z-30 flex items-center justify-end cursor-col-resize'
          style={{ width: 12, touchAction: 'none' }}
          onPointerDown={handleDividerPointerDown}
          onDoubleClick={unpin}
        >
          {/* A neutral hairline at rest; the grab affordance only shows under
              the pointer, and stays neutral — no coloured or glowing edge. */}
          <span className='pointer-events-none block h-full w-1px bg-[var(--border-base)] transition-all duration-150 group-hover:w-3px group-hover:bg-fill-4 group-active:w-3px group-active:bg-fill-4' />
        </div>
      )}
    </div>
  );
};
