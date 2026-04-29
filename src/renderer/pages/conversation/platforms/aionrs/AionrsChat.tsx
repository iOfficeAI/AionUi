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
import React, { useEffect, useMemo } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import AionrsSendBox from './AionrsSendBox';
import type { AionrsModelSelection } from './useAionrsModelSelection';

const AionrsChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: AionrsModelSelection;
  team_id?: string;
  agentSlotId?: string;
  session_mode?: string;
  emptySlot?: React.ReactNode;
}> = ({ conversation_id, workspace, modelSelection, team_id, agentSlotId, session_mode, emptySlot }) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return { conversation_id: conversation_id, workspace, type: 'aionrs' };
  }, [conversation_id, workspace]);

  return (
    <ConversationProvider value={conversationValue}>
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' emptySlot={emptySlot} />
        </FlexFullContainer>
        <AionrsSendBox
          conversation_id={conversation_id}
          modelSelection={modelSelection}
          team_id={team_id}
          agentSlotId={agentSlotId}
          session_mode={session_mode}
        />
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(AionrsChat);
