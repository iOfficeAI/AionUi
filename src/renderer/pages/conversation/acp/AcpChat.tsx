/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '@/types/acpTypes';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React from 'react';
import AcpSendBox from './AcpSendBox';
import { ConversationProvider } from '@/renderer/context/ConversationContext';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: AcpBackend;
}> = ({ conversation_id, workspace, backend }) => {
  useMessageLstCache(conversation_id);

  return (
    <ConversationProvider value={{ conversationId: conversation_id, workspace, type: 'acp' }}>
      <div className='flex-1 flex flex-col px-20px'>
        <FlexFullContainer>
          <MessageList className='flex-1'></MessageList>
        </FlexFullContainer>
        <AcpSendBox conversation_id={conversation_id} backend={backend}></AcpSendBox>
      </div>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(AcpChat);
