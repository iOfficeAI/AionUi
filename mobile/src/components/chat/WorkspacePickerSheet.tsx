import React from 'react';
import { View, Modal, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useThemeColor } from '../../hooks/useThemeColor';

type WorkspacePickerSheetProps = {
  visible: boolean;
  workspaces: string[];
  currentWorkspace: string;
  onSelect: (workspace: string) => void;
  onClose: () => void;
};

function getDisplayName(fullPath: string): string {
  const parts = fullPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || fullPath;
}

export function WorkspacePickerSheet({
  visible,
  workspaces,
  currentWorkspace,
  onSelect,
  onClose,
}: WorkspacePickerSheetProps) {
  const { t } = useTranslation();
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');

  const handleSelect = (ws: string) => {
    onSelect(ws);
    onClose();
  };

  const renderItem = ({ item }: { item: string }) => {
    const isActive = item === currentWorkspace;
    return (
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: border }]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.6}
      >
        <Ionicons name='folder-outline' size={20} color={tint} style={styles.icon} />
        <View style={styles.itemContent}>
          <ThemedText
            style={[styles.itemName, isActive && { color: tint, fontWeight: '600' }]}
            numberOfLines={1}
          >
            {getDisplayName(item)}
          </ThemedText>
          <ThemedText type='caption' numberOfLines={1}>
            {item}
          </ThemedText>
        </View>
        {isActive && <Ionicons name='checkmark' size={20} color={tint} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType='slide' transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: background }]}>
          <View style={[styles.header, { borderBottomColor: border }]}>
            <ThemedText style={styles.title}>{t('chat.selectWorkspace')}</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <ThemedText style={[styles.closeButton, { color: tint }]}>
                {t('common.close')}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {workspaces.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type='caption'>{t('chat.noRecentWorkspaces')}</ThemedText>
            </View>
          ) : (
            <FlatList
              data={workspaces}
              renderItem={renderItem}
              keyExtractor={(item) => item}
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
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 24,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
  },
});
