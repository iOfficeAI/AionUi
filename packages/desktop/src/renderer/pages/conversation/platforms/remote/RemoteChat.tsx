/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import React, { useEffect, useRef } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import RemoteSendBox from './RemoteSendBox';

const RemoteChat: React.FC<{
  conversation_id: string;
  workspace: string;
  cron_job_id?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
  loadedSkills?: string[];
  session_mode?: string;
  modelSelector?: React.ReactNode;
  /** Phase 4b: whether the OpenCode transcript has already been
   *  mirrored into the local messages table. When false on mount, we
   *  trigger `backfillHistory` once and re-load the message list. */
  history_loaded?: boolean;
}> = ({
  conversation_id,
  workspace,
  cron_job_id,
  hideSendBox,
  emptySlot,
  loadedSkills,
  session_mode,
  modelSelector,
  history_loaded,
}) => {
  const loadMessages = useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);

  // Backfill the historical transcript from OpenCode the first time
  // the user opens a remote conversation. Sync-discovered rows have
  // `history_loaded` unset (the sync service writes nothing about it),
  // so triggering on "not strictly true" — rather than "explicitly
  // false" — is what actually catches them. The backend route then
  // distinguishes sync-discovered from user-created by checking
  // whether local messages already exist (user-created rows already
  // have the streamed transcript), so this fires more freely than
  // before without risking duplicates.
  //
  // Ref guard prevents strict-mode's double-mount from firing two
  // requests. The backend is idempotent — a second call short-
  // circuits via `already_loaded` — but extra HTTP traffic is
  // wasteful and would briefly double-render the message list.
  const backfillStarted = useRef(false);
  useEffect(() => {
    if (history_loaded === true) return;
    if (backfillStarted.current) return;
    backfillStarted.current = true;
    void (async () => {
      try {
        const result = await ipcBridge.remoteAgent.backfillHistory.invoke({ conversation_id });
        if (result.inserted > 0) {
          await loadMessages();
        }
      } catch (e) {
        console.error('[RemoteChat] backfillHistory failed:', e);
        // Allow a retry on next mount if the call genuinely failed.
        backfillStarted.current = false;
      }
    })();
  }, [conversation_id, history_loaded, loadMessages]);

  return (
    <ConversationProvider
      value={{ conversation_id: conversation_id, workspace, type: 'remote', cron_job_id, hideSendBox, loadedSkills }}
    >
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' emptySlot={emptySlot}></MessageList>
        </FlexFullContainer>
        {!hideSendBox && (
          <RemoteSendBox conversation_id={conversation_id} session_mode={session_mode} modelSelector={modelSelector} />
        )}
      </div>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(RemoteChat);
