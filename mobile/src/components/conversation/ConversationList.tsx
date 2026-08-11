import React, { useCallback } from 'react';
import { View, StyleSheet, RefreshControl, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { ConversationItem } from './ConversationItem';
import { useConversations, type Conversation } from '../../context/ConversationContext';

export function ConversationList() {
  const { t } = useTranslation();
  const { conversations, isLoading, refresh, deleteConversation } = useConversations();
  const router = useRouter();

  const handlePress = useCallback(
    (conversation: Conversation) => {
      router.push(`/conversation/${conversation.id}`);
    },
    [router]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteConversation(id);
    },
    [deleteConversation]
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationItem conversation={item} onPress={() => handlePress(item)} onDelete={handleDelete} />
    ),
    [handlePress, handleDelete]
  );

  if (!isLoading && conversations.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type='subtitle' style={styles.emptyTitle}>
          {t('conversations.empty')}
        </ThemedText>
        <ThemedText type='caption'>{t('conversations.emptyHint')}</ThemedText>
      </View>
    );
  }

  return (
    <FlashList
      data={conversations}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 8,
  },
  emptyTitle: {
    textAlign: 'center',
  },
});
