/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  useMessageLstCache,
} from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import React from 'react';

const LegacyReadOnlyConversation: React.FC<{
  conversation: TChatConversation;
  emptySlot?: React.ReactNode;
}> = ({ conversation, emptySlot }) => {
  useMessageLstCache(conversation.id);

  return (
    <ConversationProvider
      value={{
        conversation_id: conversation.id,
        workspace: conversation.extra?.workspace,
        type: 'acp',
        hideSendBox: true,
        cron_job_id: conversation.extra?.cron_job_id as string | undefined,
        loadedSkills: (conversation.extra as { skills?: string[] } | undefined)?.skills,
      }}
    >
      <ConversationArtifactProvider conversation_id={conversation.id}>
        <div className='flex-1 flex flex-col px-20px min-h-0'>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider)(LegacyReadOnlyConversation);
