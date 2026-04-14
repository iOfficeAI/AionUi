/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import type { AcpBackend } from '@/common/types/acpTypes';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import React, { useEffect, useMemo, useState } from 'react';
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import AcpSendBox from './AcpSendBox';
import TeamChatEmptyState from '@renderer/pages/team/components/TeamChatEmptyState';
import { useAddEventListener } from '@/renderer/utils/emitter';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: AcpBackend;
  sessionMode?: string;
  cachedConfigOptions?: import('@/common/types/acpTypes').AcpSessionConfigOption[];
  agentName?: string;
  cronJobId?: string;
  hideSendBox?: boolean;
  teamId?: string;
  agentSlotId?: string;
}> = ({
  conversation_id,
  workspace,
  backend,
  sessionMode,
  cachedConfigOptions,
  agentName,
  cronJobId,
  hideSendBox,
  teamId,
  agentSlotId,
}) => {
  useMessageLstCache(conversation_id);
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

  const conversationValue = useMemo<ConversationContextValue>(() => {
    return {
      conversationId: conversation_id,
      workspace,
      type: 'acp',
      cronJobId,
      hideSendBox,
      isStreamingContent,
    };
  }, [conversation_id, workspace, cronJobId, hideSendBox, isStreamingContent]);

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
                  agentType={backend}
                  draftType='acp'
                />
              ) : undefined
            }
          />
        </FlexFullContainer>
        {!hideSendBox && (
          <ConversationChatConfirm conversation_id={conversation_id}>
            <AcpSendBox
              conversation_id={conversation_id}
              backend={backend}
              sessionMode={sessionMode}
              cachedConfigOptions={cachedConfigOptions}
              agentName={agentName}
              workspacePath={workspace}
              teamId={teamId}
              agentSlotId={agentSlotId}
            ></AcpSendBox>
          </ConversationChatConfirm>
        )}
      </div>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(AcpChat);
