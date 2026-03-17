import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../../src/components/ui/ThemedText';
import { api } from '../../src/services/api';
import { useConnection } from '../../src/context/ConnectionContext';
import { useThemeColor } from '../../src/hooks/useThemeColor';

type DirEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
  size?: number;
  modified?: string;
};

export default function FilesScreen() {
  const { t } = useTranslation();
  const { connectionState } = useConnection();
  const tint = useThemeColor({}, 'tint');
  const border = useThemeColor({}, 'border');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [isLoading, setIsLoading] = useState(false);
  const [canGoUp, setCanGoUp] = useState(false);
  const [parentPath, setParentPath] = useState<string | null>(null);

  const loadDirectory = useCallback(
    async (path: string) => {
      if (connectionState !== 'connected') return;
      setIsLoading(true);
      try {
        const res = await api.get('/api/directory/browse', {
          params: { path, showFiles: true },
        });
        const data = res.data;
        if (data?.items) {
          setEntries(data.items);
          setCurrentPath(data.currentPath || path);
          setParentPath(data.parentPath || null);
          setCanGoUp(data.canGoUp ?? false);
        }
      } catch (e) {
        Alert.alert(t('common.error'), t('files.errorLoading'));
      } finally {
        setIsLoading(false);
      }
    },
    [connectionState, t]
  );

  useEffect(() => {
    if (connectionState === 'connected') {
      loadDirectory('/');
    }
  }, [connectionState, loadDirectory]);

  const handlePress = (entry: DirEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.path);
    }
    // TODO: File preview
  };

  const goUp = () => {
    if (parentPath) loadDirectory(parentPath);
  };

  const iconColor = useThemeColor({}, 'icon');

  const renderItem = ({ item }: { item: DirEntry }) => (
    <TouchableOpacity
      style={[styles.item, { borderBottomColor: border }]}
      onPress={() => handlePress(item)}
      activeOpacity={0.6}
    >
      <Ionicons
        name={item.isDirectory ? 'folder' : 'document-outline'}
        size={22}
        color={item.isDirectory ? tint : iconColor}
      />
      <View style={styles.itemInfo}>
        <ThemedText numberOfLines={1} style={styles.itemName}>
          {item.name}
        </ThemedText>
        {!item.isDirectory && item.size !== undefined && (
          <ThemedText type="caption">{formatSize(item.size)}</ThemedText>
        )}
      </View>
      {item.isDirectory && <Ionicons name="chevron-forward" size={18} color={iconColor} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {canGoUp && parentPath && (
        <TouchableOpacity style={[styles.parentRow, { borderBottomColor: border }]} onPress={goUp}>
          <Ionicons name="arrow-up" size={18} color={tint} />
          <ThemedText style={[styles.parentText, { color: tint }]}>
            {t('files.parentDirectory')}
          </ThemedText>
        </TouchableOpacity>
      )}
      <FlatList
        data={entries}
        renderItem={renderItem}
        keyExtractor={(item) => item.path}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => loadDirectory(currentPath)} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <ThemedText type="caption">{t('files.empty')}</ThemedText>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  parentText: {
    fontSize: 15,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
});
