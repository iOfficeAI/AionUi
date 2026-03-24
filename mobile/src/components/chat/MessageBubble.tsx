import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import { MarkdownContent } from './MarkdownContent';
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

    case 'acp_permission':
    case 'codex_permission':
      return (
        <View style={[styles.row, styles.rowLeft]}>
          <View style={styles.confirmContainer}>
            <ConfirmationCard content={message.content} msgId={message.msg_id} />
          </View>
        </View>
      );

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
});
