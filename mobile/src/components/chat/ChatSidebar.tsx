import React, { useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { ThemedText } from '../ui/ThemedText';
import { NewConversationModal } from '../conversation/NewConversationModal';
import { WorkspaceGroup } from './WorkspaceGroup';
import { useConversations, type Conversation } from '../../context/ConversationContext';
import { useThemeColor } from '../../hooks/useThemeColor';
import { buildGroupedHistory } from '../../utils/groupingHelpers';

export function ChatSidebar({ navigation }: DrawerContentComponentProps) {
  const { t } = useTranslation();
  const { conversations, activeConversationId, setActiveConversationId, deleteConversation } = useConversations();
  const [showNewModal, setShowNewModal] = useState(false);
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');

  const grouped = useMemo(() => buildGroupedHistory(conversations, t), [conversations, t]);

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

  const renderConversationItem = (conv: Conversation) => {
    const isActive = conv.id === activeConversationId;
    const agentType = conv.extra?.backend || conv.type;
    return (
      <TouchableOpacity
        key={conv.id}
        style={[styles.item, isActive && { backgroundColor: tint + '18' }]}
        onPress={() => handleSelect(conv.id)}
        onLongPress={() => handleLongPress(conv)}
        activeOpacity={0.6}
      >
        <View style={styles.itemContent}>
          <ThemedText style={[styles.itemName, isActive && { color: tint, fontWeight: '600' }]} numberOfLines={1}>
            {conv.name || 'Untitled'}
          </ThemedText>
          <ThemedText type='caption' numberOfLines={1}>
            {agentType}
          </ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  const hasPinned = grouped.pinnedConversations.length > 0;
  const hasTimeline = grouped.timelineSections.length > 0;
  const isEmpty = !hasPinned && !hasTimeline;

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <ThemedText style={styles.headerTitle}>{t('tabs.chat')}</ThemedText>
        <TouchableOpacity onPress={() => setShowNewModal(true)} activeOpacity={0.7}>
          <Ionicons name='add-circle-outline' size={26} color={tint} />
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <ThemedText type='caption'>{t('conversations.empty')}</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {/* Pinned section */}
          {hasPinned && (
            <View>
              <View style={[styles.sectionHeader, { borderBottomColor: border }]}>
                <Ionicons name='pin' size={14} color={tint} />
                <ThemedText style={styles.sectionTitle}>{t('workspace.pinned')}</ThemedText>
              </View>
              {grouped.pinnedConversations.map(renderConversationItem)}
            </View>
          )}

          {/* Timeline sections */}
          {grouped.timelineSections.map((section) => (
            <View key={section.timeline}>
              <View style={[styles.sectionHeader, { borderBottomColor: border }]}>
                <ThemedText style={styles.sectionTitle}>{section.timeline}</ThemedText>
              </View>
              {section.items.map((item) => {
                if (item.type === 'workspace' && item.workspaceGroup) {
                  return (
                    <WorkspaceGroup
                      key={item.workspaceGroup.workspace}
                      group={item.workspaceGroup}
                      activeConversationId={activeConversationId}
                      onSelectConversation={handleSelect}
                      onLongPressConversation={handleLongPress}
                    />
                  );
                }
                if (item.type === 'conversation' && item.conversation) {
                  return renderConversationItem(item.conversation);
                }
                return null;
              })}
            </View>
          ))}
        </ScrollView>
      )}

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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.6,
    textTransform: 'uppercase',
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
