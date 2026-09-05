/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { SplitGroup } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';
import { MIN_CHAT_PANEL_PX } from '@/renderer/pages/conversation/utils/layoutCalc';
import React, { useCallback, useRef, useState } from 'react';

import { SplitGroupColumn } from './SplitGroupColumn';

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
}> = ({ group, member, focused, isLast, containerWidth, columnCount: _columnCount, trailingCount }) => {
  const maxWidth = Math.max(MIN_CHAT_PANEL_PX, Math.floor(containerWidth - MIN_CHAT_PANEL_PX * trailingCount));
  const frameRef = useRef<HTMLDivElement>(null);
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

  return (
    <div
      ref={frameRef}
      className='relative h-full shrink-0'
      style={style}
      data-testid={`split-column-frame-${member.id}`}
    >
      <SplitGroupColumn group={group} member={member} focused={focused} />
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
          <span className='pointer-events-none block h-full w-1px bg-bg-3 transition-all duration-150 group-hover:w-4px group-hover:bg-aou-6 group-active:w-4px group-active:bg-aou-6' />
        </div>
      )}
    </div>
  );
};
