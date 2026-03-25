import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { NewConversationModal } from '../conversation/NewConversationModal';
import { useConversations, type AgentInfo } from '../../context/ConversationContext';
import { useThemeColor } from '../../hooks/useThemeColor';

export function ChatEmptyState() {
  const { t } = useTranslation();
  const { startNewChat } = useConversations();
  const [showNewModal, setShowNewModal] = useState(false);
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');

  const handleAgentSelected = (agent: AgentInfo) => {
    startNewChat(agent);
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <Ionicons name='chatbubble-ellipses-outline' size={64} color={tint + '40'} />
      <ThemedText type='caption' style={styles.hint}>
        {t('chat.noConversation')}
      </ThemedText>
      <ThemedText type='caption' style={styles.subHint}>
        {t('chat.startChatHint')}
      </ThemedText>
      <TouchableOpacity style={[styles.button, { backgroundColor: tint }]} onPress={() => setShowNewModal(true)}>
        <Ionicons name='add' size={20} color='#fff' />
        <ThemedText style={styles.buttonText}>{t('chat.newChat')}</ThemedText>
      </TouchableOpacity>

      <NewConversationModal visible={showNewModal} onClose={() => setShowNewModal(false)} onAgentSelected={handleAgentSelected} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  hint: {
    fontSize: 16,
    marginTop: 8,
  },
  subHint: {
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
