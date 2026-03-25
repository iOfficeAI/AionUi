/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import React from 'react';
import GroupSendBox from './GroupSendBox';

const GroupChat: React.FC<{
  conversationId: string;
  workspace?: string;
}> = ({ conversationId, workspace }) => {
  useMessageLstCache(conversationId);

  return (
    <ConversationProvider value={{ conversationId, workspace, type: 'group' }}>
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' />
        </FlexFullContainer>
        <GroupSendBox conversationId={conversationId} />
      </div>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(GroupChat);
