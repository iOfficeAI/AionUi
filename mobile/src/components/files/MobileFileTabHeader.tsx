import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { ThemedText } from '../ui/ThemedText';
import { useFilesTab, type FileTab } from '../../context/FilesTabContext';
import { useThemeColor } from '../../hooks/useThemeColor';

type MobileFileTabHeaderProps = {
  onOpenDrawer?: () => void;
};

export function MobileFileTabHeader({ onOpenDrawer }: MobileFileTabHeaderProps) {
  const { t } = useTranslation();
  const { tabs, activeTabIndex, switchTab, closeTab } = useFilesTab();
  const [showTabList, setShowTabList] = useState(false);
  const flatListRef = React.useRef<FlatList>(null);
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');

  React.useEffect(() => {
    if (showTabList && tabs.length > 0) {
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({ index: activeTabIndex, animated: true, viewPosition: 0.5 });
        } catch {
          // Ignore
        }
      }, 100);
    }
  }, [showTabList, activeTabIndex, tabs.length]);

  const currentTab = tabs[activeTabIndex];

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .runOnJS(true)
        .onEnd((event) => {
          if (event.velocityX > 500 && activeTabIndex > 0) {
            switchTab(activeTabIndex - 1);
          } else if (event.velocityX < -500 && activeTabIndex < tabs.length - 1) {
            switchTab(activeTabIndex + 1);
          }
        }),
    [activeTabIndex, tabs.length, switchTab]
  );

  return (
    <>
      <GestureDetector gesture={swipeGesture}>
        <View style={[styles.header, { backgroundColor: background, borderBottomColor: border }]}>
          <TouchableOpacity style={styles.menuButton} onPress={onOpenDrawer}>
            <Ionicons name='menu-outline' size={26} color={tint} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.titleArea} onPress={() => tabs.length > 0 && setShowTabList(true)}>
            {currentTab ? (
              <ThemedText style={styles.title} numberOfLines={1}>
                {currentTab.title}
              </ThemedText>
            ) : (
              <ThemedText style={styles.title}>{t('files.title')}</ThemedText>
            )}
          </TouchableOpacity>

          <View style={styles.rightActions}>
            {tabs.length > 0 && (
              <TouchableOpacity
                style={[styles.tabCount, { backgroundColor: tint + '18' }]}
                onPress={() => setShowTabList(true)}
              >
                <ThemedText style={[styles.tabCountText, { color: tint }]}>
                  {activeTabIndex + 1}/{tabs.length}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </GestureDetector>

      <Modal visible={showTabList} animationType='slide' transparent onRequestClose={() => setShowTabList(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowTabList(false)} />
          <View style={[styles.modalContent, { backgroundColor: background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: border }]}>
              <ThemedText style={styles.modalTitle}>{t('workspace.openFiles')}</ThemedText>
              <TouchableOpacity onPress={() => setShowTabList(false)}>
                <Ionicons name='close' size={24} color={text} />
              </TouchableOpacity>
            </View>

            <FlatList
              ref={flatListRef}
              data={tabs}
              keyExtractor={(item) => item.path}
              renderItem={({ item, index }) => (
                <TabListItem
                  tab={item}
                  isActive={index === activeTabIndex}
                  tint={tint}
                  border={border}
                  onPress={() => {
                    switchTab(index);
                    setShowTabList(false);
                  }}
                  onClose={() => closeTab(index)}
                />
              )}
              style={styles.tabList}
              onScrollToIndexFailed={() => {}}
            />

            <TouchableOpacity
              style={[styles.openNewButton, { borderTopColor: border }]}
              onPress={() => {
                setShowTabList(false);
                onOpenDrawer?.();
              }}
            >
              <Ionicons name='add-circle-outline' size={20} color={tint} />
              <ThemedText style={{ color: tint }}>{t('workspace.openNewFile')}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

type TabListItemProps = {
  tab: FileTab;
  isActive: boolean;
  tint: string;
  border: string;
  onPress: () => void;
  onClose: () => void;
};

function TabListItem({ tab, isActive, tint, border, onPress, onClose }: TabListItemProps) {
  return (
    <TouchableOpacity
      style={[styles.tabItem, { borderBottomColor: border }, isActive && { backgroundColor: tint + '10' }]}
      onPress={onPress}
    >
      <View style={styles.tabItemContent}>
        <ThemedText style={[styles.tabItemText, isActive && { fontWeight: '600', color: tint }]} numberOfLines={1}>
          {tab.title}
        </ThemedText>
        <ThemedText type='caption' numberOfLines={1}>
          {tab.path}
        </ThemedText>
      </View>
      <TouchableOpacity style={styles.tabItemClose} onPress={onClose}>
        <Ionicons name='close-circle' size={20} color={tint + '80'} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuButton: {
    padding: 8,
    marginRight: 8,
  },
  titleArea: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabCount: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tabCountText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  tabList: {
    flexGrow: 0,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItemContent: {
    flex: 1,
  },
  tabItemText: {
    fontSize: 15,
  },
  tabItemClose: {
    padding: 4,
  },
  openNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
