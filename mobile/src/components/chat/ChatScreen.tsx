import React, { useCallback, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { MessageBubble } from './MessageBubble';
import { ToolCallSummary } from './ToolCallSummary';
import { ChatInputBar } from './ChatInputBar';
import { useChat } from '../../context/ChatContext';
import { useThemeColor } from '../../hooks/useThemeColor';
import { useProcessedMessages, type ProcessedItem } from '../../hooks/useProcessedMessages';

type ChatScreenProps = {
  conversationId: string;
};

export function ChatScreen({ conversationId }: ChatScreenProps) {
  const { t } = useTranslation();
  const { messages, isStreaming, thought, loadConversation, sendMessage, stopGeneration } = useChat();
  const flatListRef = useRef<FlatList>(null);
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const processedMessages = useProcessedMessages(messages);

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

  const renderItem = useCallback(
    ({ item }: { item: ProcessedItem }) => {
      if (item.type === 'tool_summary') {
        return <ToolCallSummary messages={item.messages} isStreaming={isStreaming} />;
      }
      return <MessageBubble message={item} />;
    },
    [isStreaming]
  );

  const keyExtractor = useCallback((item: ProcessedItem) => item.id, []);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={processedMessages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type='caption'>{t('conversations.empty')}</ThemedText>
          </View>
        }
      />
      {isStreaming && thought && (
        <View style={[styles.streamingIndicator, { backgroundColor: surface }]}>
          <ThemedText type='caption' numberOfLines={1}>
            {thought.subject || t('chat.thinking')}
          </ThemedText>
        </View>
      )}
      <ChatInputBar onSend={sendMessage} onStop={stopGeneration} isStreaming={isStreaming} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    alignItems: 'center',
  },
});
