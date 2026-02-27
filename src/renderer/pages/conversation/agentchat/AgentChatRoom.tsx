/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationProvider } from '@/renderer/context/ConversationContext';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React from 'react';
import ConversationChatConfirm from '../components/ConversationChatConfirm';
import { AgentChatProvider } from './AgentChatContext';
import AgentChatHeader from './AgentChatHeader';
import AgentChatSendBox from './AgentChatSendBox';
import AgentChatTimeline from './AgentChatTimeline';
import TodoPanel from './TodoPanel';
import styles from './agentchat.module.css';

type AgentChatRoomProps = {
  conversation_id: string;
  workspace?: string;
  backend?: string;
};

const AgentChatRoomInner: React.FC<AgentChatRoomProps> = ({ conversation_id, workspace, backend = 'claude' }) => {
  useMessageLstCache(conversation_id);

  // Capitalize first letter of backend for display
  const backendLabel = backend.charAt(0).toUpperCase() + backend.slice(1);

  return (
    <ConversationProvider value={{ conversationId: conversation_id, workspace, type: 'acp' }}>
      <AgentChatProvider>
        <div className={styles.agentchatRoot}>
          {/* Agent chat header with status pills, settings, todos toggle */}
          <div className='px-16px py-6px border-b border-solid border-[color:var(--color-border-2)]'>
            <AgentChatHeader />
          </div>

          {/* Todo panel (collapsible) */}
          <TodoPanel />

          {/* Main chat timeline — only shows meaningful text messages */}
          <FlexFullContainer>
            <AgentChatTimeline backendName={backendLabel} />
          </FlexFullContainer>

          {/* Send box with mention toggles */}
          <ConversationChatConfirm conversation_id={conversation_id}>
            <AgentChatSendBox conversation_id={conversation_id} backend={backend} />
          </ConversationChatConfirm>
        </div>
      </AgentChatProvider>
    </ConversationProvider>
  );
};

const AgentChatRoom = HOC(MessageListProvider)(AgentChatRoomInner);

export default AgentChatRoom;
