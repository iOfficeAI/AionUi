import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { ThemedText } from '../ui/ThemedText';
import { NewConversationModal } from '../conversation/NewConversationModal';
import { useConversations, type Conversation } from '../../context/ConversationContext';
import { useThemeColor } from '../../hooks/useThemeColor';

export function ChatSidebar({ navigation }: DrawerContentComponentProps) {
  const { t } = useTranslation();
  const { conversations, activeConversationId, setActiveConversationId, deleteConversation } = useConversations();
  const [showNewModal, setShowNewModal] = useState(false);
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');

  const handleSelect = (id: string) => {
    setActiveConversationId(id);
    navigation.closeDrawer();
  };

  const handleCreated = (conversationId: string) => {
    setActiveConversationId(conversationId);
    navigation.closeDrawer();
  };

  const handleLongPress = (conversation: Conversation) => {
    const confirmDelete = () => {
      Alert.alert(t('conversations.deleteConfirm'), t('conversations.deleteMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteConversation(conversation.id),
        },
      ]);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('common.cancel'), t('common.delete')],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) confirmDelete();
        }
      );
    } else {
      confirmDelete();
    }
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const isActive = item.id === activeConversationId;
    const agentType = item.extra?.backend || item.type;

    return (
      <TouchableOpacity
        style={[styles.item, isActive && { backgroundColor: tint + '18' }]}
        onPress={() => handleSelect(item.id)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.6}
      >
        <View style={styles.itemContent}>
          <ThemedText style={[styles.itemName, isActive && { color: tint, fontWeight: '600' }]} numberOfLines={1}>
            {item.name || 'Untitled'}
          </ThemedText>
          <ThemedText type='caption' numberOfLines={1}>
            {agentType}
          </ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <ThemedText style={styles.headerTitle}>{t('tabs.chat')}</ThemedText>
        <TouchableOpacity onPress={() => setShowNewModal(true)} activeOpacity={0.7}>
          <Ionicons name='add-circle-outline' size={26} color={tint} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type='caption'>{t('conversations.empty')}</ThemedText>
          </View>
        }
      />

      <NewConversationModal visible={showNewModal} onClose={() => setShowNewModal(false)} onCreated={handleCreated} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  list: {
    flexGrow: 1,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemContent: {
    gap: 2,
  },
  itemName: {
    fontSize: 15,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
});
