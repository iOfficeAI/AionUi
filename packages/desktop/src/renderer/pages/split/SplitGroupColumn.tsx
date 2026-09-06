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
import type { ColumnHeaderDragHandle } from '@/renderer/pages/conversation/hooks/chatColumnContext';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { Button, Empty, Spin, Tooltip } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import ConversationDropZone from './ConversationDropZone';
import { SplitColumnPlaceholderHeader } from './SplitColumnPlaceholderHeader';

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
  /** The header's title area is what you grab to reorder the columns. */
  headerDragHandle?: ColumnHeaderDragHandle;
}> = ({ group, member, focused, headerDragHandle }) => {
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

  // The backend answering this conversation's own read with 404 is the one
  // thing that means "deleted". One 404 is asked again before it counts; a
  // read that fails outright (network, 5xx) is retried a bounded number of
  // times and otherwise leaves the column in its error state — an error is
  // not a deletion. Counters live in refs so a re-read in flight does not
  // reset them; the column is keyed by member, so a new member starts clean.
  //
  // Spending that retry budget is not a dead end: this nudge only hurries the
  // confirming read along. SWR keeps revalidating a rejected fetch on its own
  // (`shouldRetryOnError` with no retry cap, plus a revalidate when the network
  // reconnects — the app's config only turns off focus revalidation), so once
  // the backend answers again the second 404 lands and the member is removed.
  const nullReadsRef = useRef(0);
  const failedReadsRef = useRef(0);
  useEffect(() => {
    if (isLoading || isValidating) return;
    if (conversation) {
      nullReadsRef.current = 0;
      failedReadsRef.current = 0;
      return;
    }
    if (error) {
      failedReadsRef.current += 1;
      if (nullReadsRef.current > 0 && failedReadsRef.current <= 2) void mutate();
      return;
    }
    nullReadsRef.current += 1;
    if (nullReadsRef.current < 2) {
      void mutate();
      return;
    }
    console.error(
      `[SplitGroup] Member ${member.id} of group ${group.id} no longer exists (404 twice); removing it from the group.`
    );
    void removeMember(group.id, member.id);
  }, [conversation, error, group.id, isLoading, isValidating, member.id, mutate, removeMember]);

  useEffect(() => {
    if (error) console.error(`[SplitGroup] Member ${member.id} of group ${group.id} could not be loaded:`, error);
  }, [error, group.id, member.id]);

  // Only the focused column's composer takes the keyboard focus (on mount and
  // on each change of focus); see ChatColumnContext.
  const chatColumn = useMemo(
    () => ({ composerActive: focused, compactHeader: true, columnFocused: focused, headerDragHandle }),
    [focused, headerDragHandle]
  );

  const removeButton = (
    <Tooltip content={t('conversation.splitGroup.removeMember', { name })} position='bottom'>
      <Button
        type='text'
        size='mini'
        className='h-28px w-28px'
        icon={<CloseSmall theme='outline' size='16' fill='currentColor' />}
        aria-label={t('conversation.splitGroup.removeMember', { name })}
        data-testid={`split-column-remove-${member.id}`}
        onClick={() => void removeMember(group.id, member.id)}
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
          <>
            <SplitColumnPlaceholderHeader name={name} headerDragHandle={headerDragHandle} actions={removeButton} />
            <Spin loading className='flex-1' />
          </>
        ) : conversation ? (
          <ChatColumnProvider value={chatColumn}>
            <ChatConversation conversation={conversation} previewHosted headerActions={removeButton} />
          </ChatColumnProvider>
        ) : (
          <>
            <SplitColumnPlaceholderHeader name={name} headerDragHandle={headerDragHandle} actions={removeButton} />
            <div className='flex flex-col items-center justify-center gap-12px flex-1'>
              <Empty description={t('conversation.splitGroup.memberUnavailable', { name })} />
            </div>
          </>
        )}
        {/* The focused column is outlined by a hairline in the border token,
            painted above the chat and never in the way of it. The wash that
            actually names the focused column sits on its header band; a 2px
            primary ring here read as a hard box around the conversation. */}
        <div
          aria-hidden='true'
          data-testid={`split-column-focus-ring-${member.id}`}
          className={classNames(
            'absolute inset-0 pointer-events-none transition-shadow duration-150 rd-2px',
            focused ? 'shadow-[inset_0_0_0_1px_var(--border-base)]' : ''
          )}
        />
      </div>
    </ConversationDropZone>
  );
};
