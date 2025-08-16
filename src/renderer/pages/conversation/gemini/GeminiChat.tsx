/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { TModelWithConversation } from '@/common/storage';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React from 'react';
import { useTranslation } from 'react-i18next';
import GeminiSendBox from './GeminiSendBox';

const GeminiChat: React.FC<{
  workspace: string;
  conversation_id: string;
  model: TModelWithConversation;
}> = ({ conversation_id, model }) => {
  const { t } = useTranslation();

  useMessageLstCache(conversation_id);

  return (
    <div className='h-full  flex flex-col px-20px'>
      <FlexFullContainer>
        <MessageList className='flex-1'></MessageList>
      </FlexFullContainer>
      <GeminiSendBox conversation_id={conversation_id} model={model}></GeminiSendBox>
    </div>
  );
};

export default HOC(MessageListProvider)(GeminiChat);
