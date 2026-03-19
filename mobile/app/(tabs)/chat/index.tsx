import React from 'react';
import { ChatProvider } from '../../../src/context/ChatContext';
import { ChatScreen } from '../../../src/components/chat/ChatScreen';
import { ChatEmptyState } from '../../../src/components/chat/ChatEmptyState';
import { PendingChatScreen } from '../../../src/components/chat/PendingChatScreen';
import { useConversations } from '../../../src/context/ConversationContext';

export default function ChatTabScreen() {
  const { activeConversationId, pendingAgent } = useConversations();

  if (!activeConversationId && pendingAgent) {
    return <PendingChatScreen agent={pendingAgent} />;
  }

  if (!activeConversationId) {
    return <ChatEmptyState />;
  }

  return (
    <ChatProvider key={activeConversationId}>
      <ChatScreen conversationId={activeConversationId} />
    </ChatProvider>
  );
}
