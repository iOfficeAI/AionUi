/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '@/common/acpTypes';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React from 'react';
import AcpSendBox from './AcpSendBox';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: AcpBackend;
}> = ({ conversation_id, backend }) => {
  useMessageLstCache(conversation_id);

  return (
    <div className='h-full flex flex-col px-20px'>
      <FlexFullContainer>
        <MessageList className='flex-1'></MessageList>
      </FlexFullContainer>
      <AcpSendBox conversation_id={conversation_id} backend={backend}></AcpSendBox>
    </div>
  );
};

export default HOC(MessageListProvider)(AcpChat);
