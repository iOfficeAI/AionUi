/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React, { useEffect } from 'react';
import CodexSendBox from './CodexSendBox';
import LocalImageView from '../../../components/LocalImageView';
import { ConversationProvider } from '@/renderer/context/ConversationContext';

const CodexChat: React.FC<{
  conversation_id: string;
  workspace: string;
}> = ({ conversation_id, workspace }) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  return (
    <ConversationProvider value={{ conversationId: conversation_id, workspace, type: 'codex' }}>
      <div className='flex-1 flex flex-col px-20px'>
        <FlexFullContainer>
          <MessageList className='flex-1'></MessageList>
        </FlexFullContainer>
        <CodexSendBox conversation_id={conversation_id} />
      </div>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(CodexChat);
