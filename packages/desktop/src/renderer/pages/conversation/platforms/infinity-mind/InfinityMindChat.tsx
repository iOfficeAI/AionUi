/**
 * @license
 * Copyright 2025 Infinity Mind OS
 * Direct connection to FastAPI backend on localhost:8080
 */

import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import type { TChatConversation } from '@/common/config/storage';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  useMessageLstCache,
} from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import React, { useEffect } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import InfinityMindSendBox from './InfinityMindSendBox';

type InfinityMindConversation = Extract<TChatConversation, { type: 'infinity-mind' }>;

const InfinityMindChat: React.FC<{
  conversation: InfinityMindConversation | undefined;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
}> = ({ conversation, hideSendBox, emptySlot }) => {
  if (!conversation?.id) {
    return <div>Conversation not found</div>;
  }

  const workspace = conversation.extra?.workspace || '';
  useMessageLstCache(conversation.id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  
  useEffect(() => {
    if (workspace) {
      updateLocalImage({ root: workspace });
    }
  }, [workspace, updateLocalImage]);

  return (
    <ConversationProvider
      value={{
        conversation_id: conversation.id,
        workspace,
        type: 'infinity-mind',
        cron_job_id: (conversation.extra as { cron_job_id?: string } | undefined)?.cron_job_id,
        hideSendBox,
      }}
    >
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' emptySlot={emptySlot}></MessageList>
        </FlexFullContainer>
        {!hideSendBox && <InfinityMindSendBox conversation_id={conversation.id} />}
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider)(InfinityMindChat);

