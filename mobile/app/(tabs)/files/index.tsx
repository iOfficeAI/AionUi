import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DrawerActions } from '@react-navigation/routers';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MobileFileTabHeader } from '../../../src/components/files/MobileFileTabHeader';
import { FileContentView } from '../../../src/components/files/FileContentView';
import { useFilesTab } from '../../../src/context/FilesTabContext';
import { useWorkspace } from '../../../src/context/WorkspaceContext';
import { ThemedText } from '../../../src/components/ui/ThemedText';
import { useThemeColor } from '../../../src/hooks/useThemeColor';

export default function FilesIndexScreen() {
  const { t } = useTranslation();
  const { tabs, activeTabIndex, closeAllTabs } = useFilesTab();
  const { currentWorkspace, workspaceChanged } = useWorkspace();
  const navigation = useNavigation();
  const background = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');

  // Reset tabs when workspace changes to a different project
  useEffect(() => {
    if (workspaceChanged) {
      closeAllTabs();
    }
  }, [workspaceChanged, closeAllTabs]);

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const currentTab = tabs[activeTabIndex];

  // No workspace state
  if (!currentWorkspace) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <MobileFileTabHeader onOpenDrawer={openDrawer} />
        <View style={styles.emptyState}>
          <Ionicons name='folder-open-outline' size={48} color={iconColor} style={{ opacity: 0.4 }} />
          <ThemedText style={styles.emptyText}>{t('workspace.noWorkspace')}</ThemedText>
        </View>
      </View>
    );
  }

  // No file open — show empty state with hint to open drawer
  if (!currentTab) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <MobileFileTabHeader onOpenDrawer={openDrawer} />
        <View style={styles.emptyState}>
          <Ionicons name='document-outline' size={48} color={iconColor} style={{ opacity: 0.4 }} />
          <ThemedText style={styles.emptyText}>{t('files.empty')}</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <MobileFileTabHeader onOpenDrawer={openDrawer} />
      <FileContentView path={currentTab.path} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
    fontSize: 15,
  },
});
