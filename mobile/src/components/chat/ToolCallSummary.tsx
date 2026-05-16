import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { ToolCallBlock } from './ToolCallBlock';
import { useThemeColor } from '../../hooks/useThemeColor';
import { isGroupComplete, countSteps, countErrors, getCurrentStepName } from '../../hooks/useProcessedMessages';
import type { TMessage } from '../../utils/messageAdapter';

type ToolCallSummaryProps = {
  messages: TMessage[];
  isStreaming: boolean;
};

export function ToolCallSummary({ messages, isStreaming }: ToolCallSummaryProps) {
  const complete = isGroupComplete(messages);
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const prevStreamingRef = useRef(isStreaming);

  // Reset override when streaming state changes
  useEffect(() => {
    if (prevStreamingRef.current !== isStreaming) {
      setUserOverride(null);
      prevStreamingRef.current = isStreaming;
    }
  }, [isStreaming]);

  const autoExpanded = isStreaming && !complete;
  const expanded = userOverride ?? autoExpanded;

  const toggle = () => setUserOverride((prev) => !(prev ?? autoExpanded));

  return (
    <View style={styles.wrapper}>
      <SummaryLine
        messages={messages}
        complete={complete}
        isStreaming={isStreaming}
        expanded={expanded}
        onPress={toggle}
      />
      {expanded && (
        <View style={styles.stepList}>
          {messages.map((msg) => (
            <ToolStepRow key={msg.id} message={msg} />
          ))}
        </View>
      )}
    </View>
  );
}

// --- SummaryLine ---

type SummaryLineProps = {
  messages: TMessage[];
  complete: boolean;
  isStreaming: boolean;
  expanded: boolean;
  onPress: () => void;
};

function SummaryLine({ messages, complete, isStreaming, expanded, onPress }: SummaryLineProps) {
  const { t } = useTranslation();
  const surface = useThemeColor({}, 'surface');
  const success = useThemeColor({}, 'success');
  const tint = useThemeColor({}, 'tint');
  const iconColor = useThemeColor({}, 'icon');
  const errorColor = useThemeColor({}, 'error');

  const steps = countSteps(messages);
  const errors = countErrors(messages);
  const currentStep = getCurrentStepName(messages);

  let label: string;
  if (!complete && isStreaming) {
    label = currentStep ? `${t('chat.toolSummaryExecuting')} ${currentStep}` : t('chat.toolSummaryExecuting');
  } else if (errors > 0) {
    label = t('chat.toolSummaryWithErrors', { count: steps, errorCount: errors });
  } else {
    label = t('chat.toolSummaryCompleted', { count: steps });
  }

  return (
    <TouchableOpacity style={[styles.summaryLine, { backgroundColor: surface }]} onPress={onPress} activeOpacity={0.7}>
      {!complete && isStreaming ? (
        <ActivityIndicator size='small' color={tint} style={styles.statusIcon} />
      ) : errors > 0 ? (
        <Ionicons name='alert-circle' size={18} color={errorColor} />
      ) : (
        <Ionicons name='checkmark-circle' size={18} color={success} />
      )}
      <ThemedText style={styles.summaryText} numberOfLines={1}>
        {label}
      </ThemedText>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={iconColor} />
    </TouchableOpacity>
  );
}

// --- ToolStepRow ---

function ToolStepRow({ message }: { message: TMessage }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.stepRow}>
      {expanded ? (
        <View>
          <StepRowHeader message={message} onCollapse={() => setExpanded(false)} />
          <ToolCallBlock content={message.content} type={message.type as any} />
        </View>
      ) : (
        <StepRowCollapsed message={message} onPress={() => setExpanded(true)} />
      )}
    </View>
  );
}

function StepRowHeader({ message, onCollapse }: { message: TMessage; onCollapse: () => void }) {
  const iconColor = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const items = getStepItems(message);
  const label = items.map((i) => i.name).join(', ');

  return (
    <TouchableOpacity style={styles.stepHeader} onPress={onCollapse} activeOpacity={0.7}>
      <Ionicons name='code-slash' size={14} color={tint} />
      <ThemedText style={styles.stepHeaderText} numberOfLines={1}>
        {label}
      </ThemedText>
      <Ionicons name='chevron-up' size={14} color={iconColor} />
    </TouchableOpacity>
  );
}

function StepRowCollapsed({ message, onPress }: { message: TMessage; onPress: () => void }) {
  const iconColor = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const success = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');

  const items = getStepItems(message);

  return (
    <View>
      {items.map((item, i) => {
        let statusColor = tint;
        let statusIcon: 'play-circle' | 'checkmark-circle' | 'close-circle' | 'time' = 'time';

        if (item.status === 'executing') {
          statusColor = tint;
          statusIcon = 'play-circle';
        } else if (item.status === 'success') {
          statusColor = success;
          statusIcon = 'checkmark-circle';
        } else if (item.status === 'error') {
          statusColor = errorColor;
          statusIcon = 'close-circle';
        }

        return (
          <TouchableOpacity key={i} style={styles.collapsedStep} onPress={onPress} activeOpacity={0.7}>
            <Ionicons name={statusIcon} size={16} color={statusColor} />
            <ThemedText style={styles.stepName} numberOfLines={1}>
              {item.name}
            </ThemedText>
            <Ionicons name='chevron-forward' size={14} color={iconColor} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type StepItem = { name: string; status: 'executing' | 'success' | 'error' | 'pending' };

function getStepItems(msg: TMessage): StepItem[] {
  if (msg.type === 'tool_group' && Array.isArray(msg.content)) {
    return msg.content.map((t: any) => ({
      name: t.description || t.name || t('chat.toolCall'),
      status: normalizeStatus(t.status),
    }));
  }
  if (msg.type === 'tool_call') {
    return [
      {
        name: msg.content?.name || t('chat.toolCall'),
        status: normalizeStatus(msg.content?.status),
      },
    ];
  }
  if (msg.type === 'acp_tool_call') {
    const update = msg.content?.update;
    return [
      {
        name: update?.title || update?.kind || t('chat.toolCall'),
        status: normalizeAcpStatus(update?.status),
      },
    ];
  }
  if (msg.type === 'codex_tool_call') {
    return [
      {
        name: msg.content?.title || msg.content?.description || msg.content?.kind || t('chat.toolCall'),
        status: normalizeStatus(msg.content?.status),
      },
    ];
  }
  return [{ name: t('chat.toolCall'), status: 'pending' }];
}

function normalizeStatus(s: string | undefined): StepItem['status'] {
  if (!s) return 'executing';
  const lower = s.toLowerCase();
  if (lower === 'success' || lower === 'canceled') return 'success';
  if (lower === 'error') return 'error';
  if (lower === 'executing') return 'executing';
  return 'pending';
}

function normalizeAcpStatus(s: string | undefined): StepItem['status'] {
  switch (s) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'in_progress':
      return 'executing';
    default:
      return 'pending';
  }
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  statusIcon: {
    width: 18,
    height: 18,
  },
  summaryText: {
    flex: 1,
    fontSize: 14,
  },
  stepList: {
    marginTop: 4,
    gap: 2,
  },
  stepRow: {
    maxWidth: '90%',
  },
  collapsedStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepName: {
    flex: 1,
    fontSize: 13,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepHeaderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
