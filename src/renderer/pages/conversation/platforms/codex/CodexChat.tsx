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
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import CodexRuntimePanel from './CodexRuntimePanel';
import CodexSendBox from './CodexSendBox';
import { useCodexMessage } from './useCodexMessage';

const CodexChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  sessionMode?: string;
  cronJobId?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
}> = ({ conversation_id, workspace, sessionMode, cronJobId, hideSendBox, emptySlot }) => {
  useMessageLstCache(conversation_id);
  const messageState = useCodexMessage(conversation_id);

  return (
    <ConversationProvider
      value={{
        conversationId: conversation_id,
        workspace,
        type: 'codex',
        cronJobId,
        hideSendBox,
        isStreamingContent: messageState.hasStreamingContent,
      }}
    >
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' emptySlot={emptySlot} />
        </FlexFullContainer>
        <CodexRuntimePanel
          activity={messageState.activity}
          running={messageState.running}
          tokenUsage={messageState.tokenUsage}
          contextLimit={messageState.contextLimit}
        />
        {!hideSendBox && (
          <ConversationChatConfirm conversation_id={conversation_id}>
            <CodexSendBox
              conversation_id={conversation_id}
              workspacePath={workspace}
              sessionMode={sessionMode}
              messageState={messageState}
            />
          </ConversationChatConfirm>
        )}
      </div>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(CodexChat);
