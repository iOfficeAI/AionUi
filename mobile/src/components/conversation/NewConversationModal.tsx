import React, { useEffect, useState } from 'react';
import { View, Modal, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useConversations, type AgentInfo } from '../../context/ConversationContext';
import { useThemeColor } from '../../hooks/useThemeColor';

type NewConversationModalProps = {
  visible: boolean;
  onClose: () => void;
  onAgentSelected: (agent: AgentInfo) => void;
};

const agentIcons: Record<string, string> = {
  claude: 'C',
  gemini: 'G',
  codex: 'X',
  qwen: 'Q',
};

export function NewConversationModal({ visible, onClose, onAgentSelected }: NewConversationModalProps) {
  const { t } = useTranslation();
  const { availableAgents, fetchAgents } = useConversations();
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const text = useThemeColor({}, 'text');

  useEffect(() => {
    if (visible) {
      setIsLoadingAgents(true);
      fetchAgents().finally(() => setIsLoadingAgents(false));
    }
  }, [visible, fetchAgents]);

  const handleSelect = (agent: AgentInfo) => {
    onAgentSelected(agent);
    onClose();
  };

  const renderAgent = ({ item }: { item: AgentInfo }) => {
    const icon = agentIcons[item.backend] || item.backend.charAt(0).toUpperCase();
    return (
      <TouchableOpacity
        style={[styles.agentItem, { borderBottomColor: border }]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.6}
      >
        <View style={[styles.agentIcon, { backgroundColor: tint + '20' }]}>
          <ThemedText style={[styles.agentIconText, { color: tint }]}>{icon}</ThemedText>
        </View>
        <View style={styles.agentInfo}>
          <ThemedText style={styles.agentName}>{item.label || item.name}</ThemedText>
          <ThemedText type='caption'>{item.backend}</ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType='slide' transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: background }]}>
          <View style={[styles.header, { borderBottomColor: border }]}>
            <ThemedText style={styles.title}>{t('conversations.newConversation')}</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <ThemedText style={[styles.closeButton, { color: tint }]}>{t('common.close')}</ThemedText>
            </TouchableOpacity>
          </View>

          {isLoadingAgents ? (
            <View style={styles.loading}>
              <ActivityIndicator size='small' color={tint} />
            </View>
          ) : availableAgents.length === 0 ? (
            <View style={styles.loading}>
              <ThemedText type='caption'>{t('conversations.noAgents')}</ThemedText>
            </View>
          ) : (
            <FlatList
              data={availableAgents}
              renderItem={renderAgent}
              keyExtractor={(item) => `${item.backend}-${item.name}`}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    maxHeight: '60%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  closeButton: {
    fontSize: 16,
  },
  loading: {
    padding: 40,
    alignItems: 'center',
  },
  agentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  agentIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentIconText: {
    fontSize: 18,
    fontWeight: '700',
  },
  agentInfo: {
    flex: 1,
    gap: 2,
  },
  agentName: {
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
});
