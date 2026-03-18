import React, { useCallback, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { MessageBubble } from './MessageBubble';
import { ChatInputBar } from './ChatInputBar';
import { useChat } from '../../context/ChatContext';
import type { TMessage } from '../../utils/messageAdapter';

type ChatScreenProps = {
  conversationId: string;
};

export function ChatScreen({ conversationId }: ChatScreenProps) {
  const { t } = useTranslation();
  const { messages, isStreaming, loadConversation, sendMessage, stopGeneration } = useChat();
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadConversation(conversationId);
  }, [conversationId, loadConversation]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      // Small delay to ensure layout is ready
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const renderItem = useCallback(({ item }: { item: TMessage }) => <MessageBubble message={item} />, []);

  const keyExtractor = useCallback((item: TMessage) => item.id, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type='caption'>{t('conversations.empty')}</ThemedText>
          </View>
        }
      />
      {isStreaming && (
        <View style={styles.streamingIndicator}>
          <ThemedText type='caption'>{t('chat.thinking')}</ThemedText>
        </View>
      )}
      <ChatInputBar onSend={sendMessage} onStop={stopGeneration} isStreaming={isStreaming} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  list: {
    paddingVertical: 12,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 200,
  },
  streamingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#F7F8FA',
    alignItems: 'center',
  },
});
