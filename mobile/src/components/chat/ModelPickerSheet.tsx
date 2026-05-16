import React from 'react';
import { View, Modal, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useThemeColor } from '../../hooks/useThemeColor';

type ModelItem = { id: string; label: string };

type ModelPickerSheetProps = {
  visible: boolean;
  models: ModelItem[];
  currentModelId: string | null;
  onSelect: (modelId: string) => void;
  onClose: () => void;
};

export function ModelPickerSheet({
  visible,
  models,
  currentModelId,
  onSelect,
  onClose,
}: ModelPickerSheetProps) {
  const { t } = useTranslation();
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  const renderItem = ({ item }: { item: ModelItem }) => {
    const isActive = item.id === currentModelId;
    return (
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: border }]}
        onPress={() => handleSelect(item.id)}
        activeOpacity={0.6}
      >
        <ThemedText
          style={[styles.itemLabel, isActive && { color: tint, fontWeight: '600' }]}
          numberOfLines={1}
        >
          {item.label}
        </ThemedText>
        {isActive && <Ionicons name='checkmark' size={20} color={tint} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType='slide' transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: background }]}>
          <View style={[styles.header, { borderBottomColor: border }]}>
            <ThemedText style={styles.title}>{t('chat.selectModel')}</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <ThemedText style={[styles.closeButton, { color: tint }]}>
                {t('common.close')}
              </ThemedText>
            </TouchableOpacity>
          </View>
          <FlatList
            data={models}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
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
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemLabel: {
    fontSize: 16,
    flex: 1,
  },
});
