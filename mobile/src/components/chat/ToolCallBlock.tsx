import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../ui/ThemedText';
import { useTranslation } from 'react-i18next';
import { useThemeColor } from '../../hooks/useThemeColor';

type ToolCallBlockProps = {
  content: any;
  type: 'tool_call' | 'tool_group' | 'acp_tool_call' | 'codex_tool_call';
};

function useStatusIcons() {
  const tint = useThemeColor({}, 'tint');
  const success = useThemeColor({}, 'success');
  const error = useThemeColor({}, 'error');
  const warning = useThemeColor({}, 'warning');
  const icon = useThemeColor({}, 'icon');

  return {
    Executing: { icon: 'play-circle' as const, color: tint },
    Success: { icon: 'checkmark-circle' as const, color: success },
    Error: { icon: 'close-circle' as const, color: error },
    Canceled: { icon: 'remove-circle' as const, color: icon },
    Pending: { icon: 'time' as const, color: warning },
    Confirming: { icon: 'help-circle' as const, color: '#722ED1' },
    executing: { icon: 'play-circle' as const, color: tint },
    success: { icon: 'checkmark-circle' as const, color: success },
    error: { icon: 'close-circle' as const, color: error },
    pending: { icon: 'time' as const, color: warning },
    canceled: { icon: 'remove-circle' as const, color: icon },
  };
}

export function ToolCallBlock({ content, type }: ToolCallBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const iconColor = useThemeColor({}, 'icon');
  const statusIcons = useStatusIcons();

  if (type === 'tool_group' && Array.isArray(content)) {
    return (
      <View style={[styles.container, { backgroundColor: surface }]}>
        {content.map((tool: any, i: number) => (
          <ToolItem key={tool.callId || i} tool={tool} surface={surface} border={border} iconColor={iconColor} />
        ))}
      </View>
    );
  }

  if (type === 'tool_call') {
    return (
      <View style={[styles.container, { backgroundColor: surface }]}>
        <ToolItem
          tool={{
            name: content.name,
            description: content.name,
            status: content.status === 'success' ? 'Success' : content.status === 'error' ? 'Error' : 'Executing',
            callId: content.callId,
          }}
          surface={surface}
          border={border}
          iconColor={iconColor}
        />
      </View>
    );
  }

  // codex_tool_call or acp_tool_call
  const status = content.status || 'pending';
  const title = content.title || content.description || content.kind || t('chat.toolCall');
  const info = statusIcons[status as keyof typeof statusIcons] || statusIcons.pending;

  return (
    <View style={[styles.container, { backgroundColor: surface }]}>
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: border }]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Ionicons name={info.icon} size={18} color={info.color} />
        <ThemedText style={styles.toolName} numberOfLines={expanded ? undefined : 1}>
          {title}
        </ThemedText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={iconColor} />
      </TouchableOpacity>
      {expanded && content.description && (
        <View style={[styles.detail, { backgroundColor: surface }]}>
          <ThemedText type='caption'>{content.description}</ThemedText>
        </View>
      )}
    </View>
  );
}

function ToolItem({
  tool,
  surface,
  border,
  iconColor,
}: {
  tool: any;
  surface: string;
  border: string;
  iconColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusIcons = useStatusIcons();
  const status = tool.status || 'Executing';
  const info = statusIcons[status as keyof typeof statusIcons] || statusIcons.Pending;

  return (
    <View>
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: border }]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Ionicons name={info.icon} size={18} color={info.color} />
        <ThemedText style={styles.toolName} numberOfLines={1}>
          {tool.description || tool.name || 'Tool'}
        </ThemedText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={iconColor} />
      </TouchableOpacity>
      {expanded && (
        <View style={[styles.detail, { backgroundColor: surface }]}>
          {tool.name && <ThemedText type='caption'>{tool.name}</ThemedText>}
          {typeof tool.resultDisplay === 'string' && tool.resultDisplay && (
            <ThemedText type='caption' numberOfLines={8}>
              {tool.resultDisplay}
            </ThemedText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    marginVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolName: {
    flex: 1,
    fontSize: 14,
  },
  detail: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
});
