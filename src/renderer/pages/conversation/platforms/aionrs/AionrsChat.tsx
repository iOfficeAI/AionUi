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
import AionrsSendBox from './AionrsSendBox';
import type { AionrsCapabilities } from '@/process/agent/aionrs/protocol';
import type { AionrsModelSelection } from './useAionrsModelSelection';
import type { AgentModeOption } from '@/renderer/utils/model/agentModes';

const AionrsChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: AionrsModelSelection;
  sessionMode?: string;
  capabilities?: AionrsCapabilities | null;
  dynamicModes?: AgentModeOption[];
  initialContextLimit?: number;
  initialEffort?: string;
}> = ({
  conversation_id,
  workspace,
  modelSelection,
  sessionMode,
  capabilities,
  dynamicModes,
  initialContextLimit,
  initialEffort,
}) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();

  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return {
      conversationId: conversation_id,
      workspace,
      type: 'aionrs',
    };
  }, [conversation_id, workspace]);

  return (
    <ConversationProvider value={conversationValue}>
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' />
        </FlexFullContainer>
        <ConversationChatConfirm conversation_id={conversation_id}>
          <AionrsSendBox
            conversation_id={conversation_id}
            modelSelection={modelSelection}
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
