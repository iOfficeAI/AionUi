/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React from 'react';
import CodexSendBox from './CodexSendBox';

const CodexChat: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  useMessageLstCache(conversation_id);
  return (
    <div className='h-full flex flex-col px-20px'>
      <FlexFullContainer>
        <MessageList className='flex-1'></MessageList>
      </FlexFullContainer>
      <CodexSendBox conversation_id={conversation_id} />
    </div>
  );
};

export default HOC(MessageListProvider)(CodexChat);
