import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../ui/ThemedText';
import { MarkdownContent } from './MarkdownContent';
import { ToolCallBlock } from './ToolCallBlock';
import { ConfirmationCard } from './ConfirmationCard';
import { useThemeColor } from '../../hooks/useThemeColor';
import type { TMessage } from '../../utils/messageAdapter';

type MessageBubbleProps = {
  message: TMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const tint = useThemeColor({}, 'tint');
  const surface = useThemeColor({}, 'surface');
  const error = useThemeColor({}, 'error');
  const warning = useThemeColor({}, 'warning');
  const success = useThemeColor({}, 'success');
  const tipErrorBg = useThemeColor({}, 'tipErrorBg');
  const tipWarningBg = useThemeColor({}, 'tipWarningBg');
  const tipSuccessBg = useThemeColor({}, 'tipSuccessBg');

  switch (message.type) {
    case 'text': {
      const isUser = message.position === 'right';
      return (
        <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
          <View
            style={[
              styles.bubble,
              isUser
                ? [styles.bubbleUser, { backgroundColor: tint }]
                : [styles.bubbleAssistant, { backgroundColor: surface }],
            ]}
          >
            {isUser ? (
              <ThemedText style={styles.userText}>{message.content.content}</ThemedText>
            ) : (
              <MarkdownContent content={message.content.content} />
            )}
          </View>
        </View>
      );
    }

    case 'tips': {
      const tipType = message.content.type;
      const bgColor = tipType === 'error' ? tipErrorBg : tipType === 'warning' ? tipWarningBg : tipSuccessBg;
      const textColor = tipType === 'error' ? error : tipType === 'warning' ? warning : success;
      return (
        <View style={styles.tipRow}>
          <View style={[styles.tipBubble, { backgroundColor: bgColor }]}>
            <ThemedText style={[styles.tipText, { color: textColor }]}>{message.content.content}</ThemedText>
          </View>
        </View>
      );
    }

    case 'agent_status': {
      const status = message.content.status;
      const agentName = message.content.agentName || message.content.backend;
      return (
        <View style={styles.tipRow}>
          <View style={[styles.statusBubble, { backgroundColor: surface }]}>
            <ThemedText type='caption'>
              {agentName}: {status}
            </ThemedText>
          </View>
        </View>
      );
    }

    case 'tool_call':
    case 'tool_group':
    case 'acp_tool_call':
    case 'codex_tool_call':
      return (
        <View style={[styles.row, styles.rowLeft]}>
          <View style={styles.toolContainer}>
            <ToolCallBlock content={message.content} type={message.type} />
          </View>
        </View>
      );

    case 'acp_permission':
    case 'codex_permission':
      return (
        <View style={[styles.row, styles.rowLeft]}>
          <View style={styles.confirmContainer}>
            <ConfirmationCard content={message.content} msgId={message.msg_id} />
          </View>
        </View>
      );

    case 'thought': {
      return <ThoughtBlock content={message.content} />;
    }

    case 'plan': {
      const entries = message.content?.entries || [];
      return (
        <View style={[styles.row, styles.rowLeft]}>
          <View style={[styles.planContainer, { backgroundColor: surface }]}>
            <ThemedText style={styles.planTitle}>Plan</ThemedText>
            {entries.map((entry: any, i: number) => (
              <View key={i} style={styles.planEntry}>
                <ThemedText type='caption'>
                  {entry.status === 'completed' ? '\u2705' : entry.status === 'in_progress' ? '\u23F3' : '\u2B55'}{' '}
                  {entry.title || entry.description}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      );
    }

    default:
      return null;
  }
}

function ThoughtBlock({ content }: { content: { subject: string; description: string } }) {
  const [expanded, setExpanded] = useState(false);
  const surface = useThemeColor({}, 'surface');
  const textSecondary = useThemeColor({}, 'textSecondary');

  return (
    <View style={[styles.row, styles.rowLeft]}>
      <TouchableOpacity
        style={[styles.thoughtContainer, { backgroundColor: surface }]}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.thoughtHeader}>
          <Ionicons name='bulb-outline' size={14} color={textSecondary} />
          <ThemedText type='caption' style={styles.thoughtSubject} numberOfLines={expanded ? undefined : 1}>
            {content.subject}
          </ThemedText>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={textSecondary} />
        </View>
        {expanded && content.description ? (
          <ThemedText type='caption' style={[styles.thoughtDescription, { color: textSecondary }]}>
            {content.description}
          </ThemedText>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  tipRow: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  tipBubble: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    maxWidth: '90%',
  },
  tipText: {
    fontSize: 13,
    textAlign: 'center',
  },
  statusBubble: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  toolContainer: {
    maxWidth: '90%',
  },
  confirmContainer: {
    maxWidth: '90%',
  },
  planContainer: {
    borderRadius: 12,
    padding: 14,
    maxWidth: '90%',
    gap: 4,
  },
  planTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  planEntry: {
    paddingVertical: 2,
  },
  thoughtContainer: {
    borderRadius: 12,
    padding: 10,
    maxWidth: '90%',
  },
  thoughtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  thoughtSubject: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  thoughtDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
});
