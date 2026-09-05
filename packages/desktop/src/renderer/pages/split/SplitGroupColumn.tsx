/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';
import { useSplitGroupMutations } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import type { SplitGroup } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';
import { ChatColumnProvider } from '@/renderer/pages/conversation/hooks/chatColumnContext';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { MIN_CHAT_PANEL_PX } from '@/renderer/pages/conversation/utils/layoutCalc';
import { Button, Empty, Spin, Tooltip } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import ConversationDropZone from './ConversationDropZone';

/**
 * One member of an open split group: a full, live conversation view with a ×
 * in its header that takes it out of the group. Keyed by conversation id by
 * its parent, so a column is only ever unmounted and mounted, never re-pointed
 * at another conversation (a view's queued live messages must not leak).
 */
export const SplitGroupColumn: React.FC<{
  group: SplitGroup;
  member: TChatConversation;
  focused: boolean;
}> = ({ group, member, focused }) => {
  const { t } = useTranslation();
  const { removeMember } = useSplitGroupMutations();
  const name = member.name || t('conversation.welcome.newConversation');
  const {
    data: conversation,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(['split-column', member.id], () => getConversationOrNull(member.id));

  // Same refetch trigger as the single route: the backend reports the row
  // changed (project_id backfill, rename, …).
  useEffect(() => {
    return ipcBridge.conversation.listChanged.on((event) => {
      if (event.conversation_id !== member.id || (event.action !== 'updated' && event.action !== 'created')) return;
      void mutate();
    });
  }, [member.id, mutate]);

  // The list said this conversation exists but the backend has no such row:
  // the tag points at a deleted conversation. Ask once more before acting on
  // it — a single read is not proof — then drop it from the group and say so,
  // rather than showing an empty column forever.
  const missing = !isLoading && !isValidating && !error && conversation === null;
  const missingConfirmationsRef = useRef(0);
  useEffect(() => {
    if (!missing) {
      missingConfirmationsRef.current = 0;
      return;
    }
    if (missingConfirmationsRef.current === 0) {
      missingConfirmationsRef.current = 1;
      void mutate();
      return;
    }
    console.error(
      `[SplitGroup] Member ${member.id} of group ${group.id} no longer exists; removing it from the group.`
    );
    void removeMember(group, member.id);
  }, [group, member.id, missing, mutate, removeMember]);

  useEffect(() => {
    if (error) console.error(`[SplitGroup] Member ${member.id} of group ${group.id} could not be loaded:`, error);
  }, [error, group.id, member.id]);

  // Only the focused column's composer takes the keyboard focus (on mount and
  // on each change of focus); see ChatColumnContext.
  const chatColumn = useMemo(() => ({ composerActive: focused }), [focused]);

  const removeButton = (
    <Tooltip content={t('conversation.splitGroup.removeMember', { name })} position='bottom'>
      <Button
        type='text'
        size='mini'
        className='h-28px w-28px'
        icon={<CloseSmall theme='outline' size='16' fill='currentColor' />}
        aria-label={t('conversation.splitGroup.removeMember', { name })}
        data-testid={`split-column-remove-${member.id}`}
        onClick={() => void removeMember(group, member.id)}
      />
    </Tooltip>
  );

  return (
    <ConversationDropZone conversation_id={member.id} mode='add' className='h-full'>
      <div
        className='relative flex flex-col h-full min-w-0 min-h-0'
        data-testid={`split-column-${member.id}`}
        data-focused={focused ? 'true' : 'false'}
      >
        {isLoading ? (
          <Spin loading className='flex-1' />
        ) : conversation ? (
          <ChatColumnProvider value={chatColumn}>
            <ChatConversation conversation={conversation} previewHosted headerActions={removeButton} />
          </ChatColumnProvider>
        ) : (
          <div className='flex flex-col items-center justify-center gap-12px flex-1'>
            <Empty description={t('conversation.splitGroup.memberUnavailable', { name })} />
            {removeButton}
          </div>
        )}
        {/* The focused column carries the highlight; painted above the chat and
            never in the way of it. */}
        <div
          aria-hidden='true'
          className={classNames(
            'absolute inset-0 pointer-events-none transition-shadow duration-150',
            focused ? 'shadow-[inset_0_0_0_2px_rgb(var(--primary-6))]' : ''
          )}
        />
      </div>
    </ConversationDropZone>
  );
};

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
 * its right edge. Below a comfortable minimum the row scrolls sideways, like
 * the Team view.
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
          <span className='pointer-events-none block h-full w-2px bg-bg-3 opacity-60 rd-full transition-all duration-150 group-hover:w-6px group-hover:bg-aou-6 group-hover:opacity-100 group-active:w-6px group-active:bg-aou-6 group-active:opacity-100' />
        </div>
      )}
    </div>
  );
};
