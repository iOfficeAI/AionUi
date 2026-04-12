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
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import GeminiSendBox from './GeminiSendBox';
import type { GeminiModelSelection } from './useGeminiModelSelection';
import TeamChatEmptyState from '@renderer/pages/team/components/TeamChatEmptyState';

// GeminiChat 接收共享的模型选择状态，避免组件内重复管理
// GeminiChat consumes shared model selection state to avoid duplicate logic
const GeminiChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: GeminiModelSelection;
  cronJobId?: string;
  hideSendBox?: boolean;
  teamId?: string;
  agentSlotId?: string;
  agentName?: string;
  agentType?: string;
}> = ({
  conversation_id,
  workspace,
  modelSelection,
  cronJobId,
  hideSendBox,
  teamId,
  agentSlotId,
  agentName,
  agentType,
}) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return { conversationId: conversation_id, workspace, type: 'gemini', cronJobId, hideSendBox };
  }, [conversation_id, workspace, cronJobId, hideSendBox]);

  return (
    <ConversationProvider value={conversationValue}>
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList
            className='flex-1'
            emptySlot={
              teamId ? (
                <TeamChatEmptyState
                  conversationId={conversation_id}
                  agentName={agentName ?? 'Leader'}
                  agentType={agentType ?? 'gemini'}
                  draftType='gemini'
                />
              ) : undefined
            }
          ></MessageList>
        </FlexFullContainer>
        {!hideSendBox && (
          <ConversationChatConfirm conversation_id={conversation_id}>
            <GeminiSendBox
              conversation_id={conversation_id}
              modelSelection={modelSelection}
              teamId={teamId}
              agentSlotId={agentSlotId}
            ></GeminiSendBox>
          </ConversationChatConfirm>
        )}
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(GeminiChat);
