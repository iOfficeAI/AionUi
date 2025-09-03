/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TModelWithConversation } from '@/common/storage';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React, { useEffect } from 'react';
import LocalImageView from '../../../components/LocalImageView';
import GeminiSendBox from './GeminiSendBox';

const GeminiChat: React.FC<{
  conversation_id: string;
  model: TModelWithConversation;
  workspace: string;
}> = ({ conversation_id, model, workspace }) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);

  return (
    <div className='h-full  flex flex-col px-20px'>
      <FlexFullContainer>
        <MessageList className='flex-1'></MessageList>
      </FlexFullContainer>
      <GeminiSendBox conversation_id={conversation_id} model={model}></GeminiSendBox>
    </div>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(GeminiChat);
