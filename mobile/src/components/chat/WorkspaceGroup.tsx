import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ThemedText } from '../ui/ThemedText';
import { useThemeColor } from '../../hooks/useThemeColor';
import type { WorkspaceGroup as WorkspaceGroupType } from '../../utils/groupingHelpers';
import type { Conversation } from '../../context/ConversationContext';

type WorkspaceGroupProps = {
  group: WorkspaceGroupType;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onLongPressConversation: (conversation: Conversation) => void;
  defaultExpanded?: boolean;
};

export function WorkspaceGroup({
  group,
  activeConversationId,
  onSelectConversation,
  onLongPressConversation,
  defaultExpanded = false,
}: WorkspaceGroupProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const tint = useThemeColor({}, 'tint');
  const surface = useThemeColor({}, 'surface');

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(expanded ? '90deg' : '0deg', { duration: 200 }) }],
  }));

  return (
    <View>
      <TouchableOpacity
        style={[styles.header, { backgroundColor: surface }]}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.6}
      >
        <Ionicons name='folder' size={16} color={tint} />
        <ThemedText style={styles.displayName} numberOfLines={1}>
          {group.displayName}
        </ThemedText>
        <ThemedText type='caption' style={styles.count}>
          {group.conversations.length} {t('workspace.sessions')}
        </ThemedText>
        <Animated.View style={chevronStyle}>
          <Ionicons name='chevron-forward' size={14} color={tint} />
        </Animated.View>
      </TouchableOpacity>

      {expanded &&
        group.conversations.map((conv) => {
          const isActive = conv.id === activeConversationId;
          const agentType = conv.extra?.backend || conv.type;
          return (
            <TouchableOpacity
              key={conv.id}
              style={[styles.item, isActive && { backgroundColor: tint + '18' }]}
              onPress={() => onSelectConversation(conv.id)}
              onLongPress={() => onLongPressConversation(conv)}
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
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  displayName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  count: {
    fontSize: 12,
  },
  item: {
    paddingLeft: 40,
    paddingRight: 16,
    paddingVertical: 12,
  },
  itemContent: {
    gap: 2,
  },
  itemName: {
    fontSize: 15,
  },
});
