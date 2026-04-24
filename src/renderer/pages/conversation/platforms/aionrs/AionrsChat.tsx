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
import React, { useEffect, useMemo, useState } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import AionrsSendBox from './AionrsSendBox';
import type { AionrsCapabilities } from '@/process/agent/aionrs/protocol';
import type { AgentModeOption } from '@/renderer/utils/model/agentModes';
import { useAddEventListener } from '@/renderer/utils/emitter';
import type { AionrsModelSelection } from './useAionrsModelSelection';

const AionrsChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: AionrsModelSelection;
  teamId?: string;
  agentSlotId?: string;
  sessionMode?: string;
  capabilities?: AionrsCapabilities | null;
  dynamicModes?: AgentModeOption[];
  initialContextLimit?: number;
  initialEffort?: string;
  emptySlot?: React.ReactNode;
}> = ({
  conversation_id,
  workspace,
  modelSelection,
  teamId,
  agentSlotId,
  sessionMode,
  capabilities,
  dynamicModes,
  initialContextLimit,
  initialEffort,
  emptySlot,
}) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
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

  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return { conversationId: conversation_id, workspace, type: 'aionrs', isStreamingContent };
  }, [conversation_id, isStreamingContent, workspace]);

  return (
    <ConversationProvider value={conversationValue}>
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' emptySlot={emptySlot} />
        </FlexFullContainer>
        <ConversationChatConfirm conversation_id={conversation_id}>
          <AionrsSendBox
            conversation_id={conversation_id}
            modelSelection={modelSelection}
            teamId={teamId}
            agentSlotId={agentSlotId}
            sessionMode={sessionMode}
            capabilities={capabilities}
            dynamicModes={dynamicModes}
            initialContextLimit={initialContextLimit}
            initialEffort={initialEffort}
          />
        </ConversationChatConfirm>
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(AionrsChat);
