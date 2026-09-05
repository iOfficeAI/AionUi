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
import { Button, Empty, Spin, Tooltip } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useMemo, useRef } from 'react';
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
  const chatColumn = useMemo(() => ({ composerActive: focused, compactHeader: true }), [focused]);

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
