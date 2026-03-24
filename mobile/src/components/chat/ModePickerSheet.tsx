import React from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useThemeColor } from '../../hooks/useThemeColor';
import type { AgentModeOption } from '../../constants/agentModes';

type ModePickerSheetProps = {
  visible: boolean;
  modes: AgentModeOption[];
  currentMode: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

export function showModeActionSheet(
  modes: AgentModeOption[],
  currentMode: string,
  onSelect: (value: string) => void,
) {
  if (Platform.OS === 'ios') {
    const options = [...modes.map((m) => m.label), 'Cancel'];
    const cancelButtonIndex = options.length - 1;
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex },
      (index) => {
        if (index !== cancelButtonIndex) {
          onSelect(modes[index].value);
        }
      },
    );
    return true;
  }
  return false;
}

export function ModePickerSheet({
  visible,
  modes,
  currentMode,
  onSelect,
  onClose,
}: ModePickerSheetProps) {
  const { t } = useTranslation();
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  const renderItem = ({ item }: { item: AgentModeOption }) => {
    const isActive = item.value === currentMode;
    return (
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: border }]}
        onPress={() => handleSelect(item.value)}
        activeOpacity={0.6}
      >
        <View style={styles.itemContent}>
          <ThemedText style={[styles.itemLabel, isActive && { color: tint, fontWeight: '600' }]}>
            {item.label}
          </ThemedText>
          {item.description && <ThemedText type='caption'>{item.description}</ThemedText>}
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
            <ThemedText style={styles.title}>{t('chat.selectMode')}</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <ThemedText style={[styles.closeButton, { color: tint }]}>
                {t('common.close')}
              </ThemedText>
            </TouchableOpacity>
          </View>
          <FlatList
            data={modes}
            renderItem={renderItem}
            keyExtractor={(item) => item.value}
          />
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
    maxHeight: '50%',
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
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemLabel: {
    fontSize: 16,
  },
});
