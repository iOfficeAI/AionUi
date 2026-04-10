import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { ThemedText } from '../ui/ThemedText';
import { NewConversationModal } from '../conversation/NewConversationModal';
import { WorkspaceGroup } from './WorkspaceGroup';
import { useConversations, type Conversation, type AgentInfo } from '../../context/ConversationContext';
import { useThemeColor } from '../../hooks/useThemeColor';
import { buildGroupedHistory } from '../../utils/groupingHelpers';

export function ChatSidebar({ navigation }: DrawerContentComponentProps) {
  const { t } = useTranslation();
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    startNewChat,
    deleteConversation,
    renameConversation,
  } = useConversations();
  const [showNewModal, setShowNewModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const surface = useThemeColor({}, 'surface');
  const textColor = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.extra?.agentName || '').toLowerCase().includes(q) ||
        (c.extra?.backend || '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const grouped = useMemo(() => buildGroupedHistory(filteredConversations, t), [filteredConversations, t]);

  const handleSelect = (id: string) => {
    setActiveConversationId(id);
    navigation.closeDrawer();
  };

  const handleAgentSelected = (agent: AgentInfo) => {
    startNewChat(agent);
    navigation.closeDrawer();
  };

  const promptRename = (conversation: Conversation) => {
    Alert.prompt(
      t('conversations.renameTitle'),
      undefined,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async (newName?: string) => {
            if (!newName?.trim()) return;
            const ok = await renameConversation(conversation.id, newName.trim());
            if (!ok) {
              Alert.alert(t('conversations.renameFailed'));
            }
          },
        },
      ],
      'plain-text',
      conversation.name || ''
    );
  };

  const promptRenameAndroid = (conversation: Conversation) => {
    // Android doesn't support Alert.prompt — use a simple confirm + edit flow
    // We reuse the name as a prompt fallback
    Alert.alert(t('conversations.renameTitle'), t('conversations.renamePlaceholder'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () => {
          // On Android, we'll use a workaround — prompt via state
          setRenameTarget(conversation);
        },
      },
    ]);
  };

  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameText, setRenameText] = useState('');

  // When renameTarget is set, show the inline rename input
  React.useEffect(() => {
    if (renameTarget) {
      setRenameText(renameTarget.name || '');
    }
  }, [renameTarget]);

  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameText.trim()) {
      setRenameTarget(null);
      return;
    }
    const ok = await renameConversation(renameTarget.id, renameText.trim());
    if (!ok) {
      Alert.alert(t('conversations.renameFailed'));
    }
    setRenameTarget(null);
  };

  const handleLongPress = (conversation: Conversation) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('common.cancel'), t('conversations.rename'), t('common.delete')],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) promptRename(conversation);
          if (index === 2) confirmDelete(conversation);
        }
      );
    } else {
      Alert.alert(conversation.name || t('conversations.untitled'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('conversations.rename'), onPress: () => promptRenameAndroid(conversation) },
        { text: t('common.delete'), style: 'destructive', onPress: () => confirmDelete(conversation) },
      ]);
    }
  };

  const confirmDelete = (conversation: Conversation) => {
    Alert.alert(t('conversations.deleteConfirm'), t('conversations.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteConversation(conversation.id),
      },
    ]);
  };

  const renderConversationItem = (conv: Conversation) => {
    const isActive = conv.id === activeConversationId;
    const agentType = conv.extra?.backend || conv.type;

    // If this conversation is the rename target on Android, show inline input
    if (renameTarget?.id === conv.id && Platform.OS !== 'ios') {
      return (
        <View key={conv.id} style={[styles.item, styles.renameRow]}>
          <TextInput
            style={[styles.renameInput, { color: textColor, borderColor: tint }]}
            value={renameText}
            onChangeText={setRenameText}
            onSubmitEditing={handleRenameSubmit}
            onBlur={handleRenameSubmit}
            autoFocus
            selectTextOnFocus
          />
        </View>
      );
    }

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
            {conv.name || t('conversations.untitled')}
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

      {/* Search bar */}
      <View style={[styles.searchContainer, { borderBottomColor: border }]}>
        <View style={[styles.searchBar, { backgroundColor: surface }]}>
          <Ionicons name='search' size={16} color={textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder={t('conversations.searchPlaceholder')}
            placeholderTextColor={textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode='while-editing'
            autoCorrect={false}
            autoCapitalize='none'
          />
          {searchQuery.length > 0 && Platform.OS !== 'ios' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name='close-circle' size={16} color={textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <ThemedText type='caption'>
            {searchQuery.trim() ? t('conversations.noResults') : t('conversations.empty')}
          </ThemedText>
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

      <NewConversationModal visible={showNewModal} onClose={() => setShowNewModal(false)} onAgentSelected={handleAgentSelected} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
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
  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
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
  renameRow: {
    paddingVertical: 6,
  },
  renameInput: {
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
});
