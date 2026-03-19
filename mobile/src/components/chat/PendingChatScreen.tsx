import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { ChatInputBar } from './ChatInputBar';
import { useConversations, type AgentInfo } from '../../context/ConversationContext';
import { useThemeColor } from '../../hooks/useThemeColor';

type PendingChatScreenProps = {
  agent: AgentInfo;
};

export function PendingChatScreen({ agent }: PendingChatScreenProps) {
  const { t } = useTranslation();
  const { commitNewChat } = useConversations();
  const [isSending, setIsSending] = useState(false);
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');

  const handleSend = async (text: string) => {
    if (isSending) return;
    setIsSending(true);
    try {
      await commitNewChat(text);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.content}>
        <Ionicons name='chatbubble-ellipses-outline' size={48} color={tint + '40'} />
        <ThemedText style={styles.agentLabel}>{agent.label || agent.name}</ThemedText>
        <ThemedText type='caption'>{t('chat.pendingHint')}</ThemedText>
      </View>
      <ChatInputBar onSend={handleSend} disabled={isSending} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 32,
  },
  agentLabel: {
    fontSize: 18,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
