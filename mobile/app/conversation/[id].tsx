import React from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { ChatProvider } from '../../src/context/ChatContext';
import { ChatScreen } from '../../src/components/chat/ChatScreen';
import { useConversations } from '../../src/context/ConversationContext';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conversations } = useConversations();
  const navigation = useNavigation();

  // Set the conversation name as the header title
  useEffect(() => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      navigation.setOptions({ headerTitle: conv.name || 'Chat' });
    }
  }, [id, conversations, navigation]);

  if (!id) return null;

  return (
    <ChatProvider>
      <ChatScreen conversationId={id} />
    </ChatProvider>
  );
}
