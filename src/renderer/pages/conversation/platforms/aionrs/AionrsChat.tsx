/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import React, { useEffect, useMemo, useState } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import AionrsSendBox from './AionrsSendBox';
import type { AionrsModelSelection } from './useAionrsModelSelection';
import { useAddEventListener } from '@/renderer/utils/emitter';

const AionrsChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: AionrsModelSelection;
}> = ({ conversation_id, workspace, modelSelection }) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  const [isStreamingContent, setIsStreamingContent] = useState(false);

  useEffect(() => {
    setIsStreamingContent(false);
  }, [conversation_id]);
  useAddEventListener(
    'conversation.streaming',
    ({ conversationId, isStreaming }) => {
      if (conversationId === conversation_id) {
        setIsStreamingContent(isStreaming);
      }
    },
    [conversation_id]
  );

  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return {
      conversationId: conversation_id,
      workspace,
      type: 'aionrs',
      isStreamingContent,
    };
  }, [conversation_id, isStreamingContent, workspace]);

  return (
    <ConversationProvider value={conversationValue}>
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' />
        </FlexFullContainer>
        <ConversationChatConfirm conversation_id={conversation_id}>
          <AionrsSendBox conversation_id={conversation_id} modelSelection={modelSelection} />
        </ConversationChatConfirm>
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(AionrsChat);
