import React from 'react';
import { View, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useThemeColor } from '../../hooks/useThemeColor';
import type { Conversation } from '../../context/ConversationContext';

type ConversationItemProps = {
  conversation: Conversation;
  onPress: () => void;
  onDelete?: (id: string) => void;
};

const agentBadgeColors: Record<string, string> = {
  claude: '#D97706',
  gemini: '#2563EB',
  codex: '#059669',
  qwen: '#7C3AED',
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ConversationItem({ conversation, onPress, onDelete }: ConversationItemProps) {
  const { t } = useTranslation();
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');
  const agentType = conversation.extra?.backend || conversation.type;
  const badgeColor = agentBadgeColors[agentType] || '#6B7280';
  const statusDot =
    conversation.status === 'running' ? success : conversation.status === 'pending' ? warning : undefined;

  const handleLongPress = () => {
    if (!onDelete) return;

    const confirmDelete = () => {
      Alert.alert(t('conversations.deleteConfirm'), t('conversations.deleteMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => onDelete(conversation.id),
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

  return (
    <TouchableOpacity
      style={[styles.container, { borderBottomColor: border }]}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.6}
    >
      <View style={styles.row}>
        <View style={styles.nameRow}>
          {statusDot && <View style={[styles.statusDot, { backgroundColor: statusDot }]} />}
          <ThemedText style={styles.name} numberOfLines={1}>
            {conversation.name || 'Untitled'}
          </ThemedText>
        </View>
        <ThemedText type='caption'>{formatTime(conversation.modifyTime)}</ThemedText>
      </View>

      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: badgeColor + '20' }]}>
          <ThemedText style={[styles.badgeText, { color: badgeColor }]}>{agentType}</ThemedText>
        </View>
        {conversation.model?.useModel && (
          <ThemedText type='caption' numberOfLines={1} style={styles.model}>
            {conversation.model.useModel}
          </ThemedText>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  model: {
    maxWidth: 160,
  },
});
