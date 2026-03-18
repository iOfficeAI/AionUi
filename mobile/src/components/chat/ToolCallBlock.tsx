import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../ui/ThemedText';
import { useTranslation } from 'react-i18next';

type ToolCallBlockProps = {
  content: any;
  type: 'tool_call' | 'tool_group' | 'acp_tool_call' | 'codex_tool_call';
};

const statusIcons: Record<string, { icon: string; color: string }> = {
  Executing: { icon: 'play-circle', color: '#165DFF' },
  Success: { icon: 'checkmark-circle', color: '#00B42A' },
  Error: { icon: 'close-circle', color: '#F53F3F' },
  Canceled: { icon: 'remove-circle', color: '#86909C' },
  Pending: { icon: 'time', color: '#FF7D00' },
  Confirming: { icon: 'help-circle', color: '#722ED1' },
  // For codex/acp tool calls
  executing: { icon: 'play-circle', color: '#165DFF' },
  success: { icon: 'checkmark-circle', color: '#00B42A' },
  error: { icon: 'close-circle', color: '#F53F3F' },
  pending: { icon: 'time', color: '#FF7D00' },
  canceled: { icon: 'remove-circle', color: '#86909C' },
};

export function ToolCallBlock({ content, type }: ToolCallBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (type === 'tool_group' && Array.isArray(content)) {
    return (
      <View style={styles.container}>
        {content.map((tool: any, i: number) => (
          <ToolItem key={tool.callId || i} tool={tool} />
        ))}
      </View>
    );
  }

  if (type === 'tool_call') {
    return (
      <View style={styles.container}>
        <ToolItem
          tool={{
            name: content.name,
            description: content.name,
            status: content.status === 'success' ? 'Success' : content.status === 'error' ? 'Error' : 'Executing',
            callId: content.callId,
          }}
        />
      </View>
    );
  }

  // codex_tool_call or acp_tool_call
  const status = content.status || 'pending';
  const title = content.title || content.description || content.kind || t('chat.toolCall');
  const info = statusIcons[status] || statusIcons.pending;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.item} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <Ionicons name={info.icon as any} size={18} color={info.color} />
        <ThemedText style={styles.toolName} numberOfLines={expanded ? undefined : 1}>
          {title}
        </ThemedText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color='#86909C' />
      </TouchableOpacity>
      {expanded && content.description && (
        <View style={styles.detail}>
          <ThemedText type='caption'>{content.description}</ThemedText>
        </View>
      )}
    </View>
  );
}

function ToolItem({ tool }: { tool: any }) {
  const [expanded, setExpanded] = useState(false);
  const status = tool.status || 'Executing';
  const info = statusIcons[status] || statusIcons.Pending;

  return (
    <View>
      <TouchableOpacity style={styles.item} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <Ionicons name={info.icon as any} size={18} color={info.color} />
        <ThemedText style={styles.toolName} numberOfLines={1}>
          {tool.description || tool.name || 'Tool'}
        </ThemedText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color='#86909C' />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.detail}>
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
    backgroundColor: '#F7F8FA',
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
    borderBottomColor: '#E5E8EB',
  },
  toolName: {
    flex: 1,
    fontSize: 14,
  },
  detail: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F2F3F5',
    gap: 4,
  },
});
