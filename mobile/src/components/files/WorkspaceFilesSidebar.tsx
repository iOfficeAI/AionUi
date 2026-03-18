import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useFilesTab } from '../../context/FilesTabContext';
import { useThemeColor } from '../../hooks/useThemeColor';
import { api } from '../../services/api';

type DirEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
};

type FlatItem = DirEntry & {
  depth: number;
  isExpanded?: boolean;
};

type WorkspaceFilesSidebarProps = {
  navigation: { closeDrawer(): void; openDrawer(): void };
};

export function WorkspaceFilesSidebar({ navigation }: WorkspaceFilesSidebarProps) {
  const { t } = useTranslation();
  const { currentWorkspace, workspaceDisplayName, workspaceChanged } = useWorkspace();
  const { openTab } = useFilesTab();
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const iconColor = useThemeColor({}, 'icon');

  const [tree, setTree] = useState<DirEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const res = await api.get('/api/directory/browse', {
          params: { path, showFiles: true },
        });
        if (res.data?.items) {
          setTree(res.data.items);
        }
      } catch {
        Alert.alert(t('common.error'), t('workspace.errorLoading'));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  // Load files when workspace changes
  useEffect(() => {
    if (currentWorkspace) {
      setExpanded(new Set());
      void fetchFiles(currentWorkspace);
    } else {
      setTree([]);
    }
  }, [currentWorkspace, fetchFiles]);

  // Reset expansion when workspace changes to different project
  useEffect(() => {
    if (workspaceChanged) {
      setExpanded(new Set());
    }
  }, [workspaceChanged]);

  const toggleFolder = useCallback(async (entry: DirEntry) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
      }
      return next;
    });

    // Load subdirectory contents on first expansion
    try {
      const res = await api.get('/api/directory/browse', {
        params: { path: entry.path, showFiles: true },
      });
      if (res.data?.items) {
        setTree((prev) => {
          // Add children under parent — store as flat list, we handle nesting in flattenTree
          const children: DirEntry[] = res.data.items;
          const existingPaths = new Set(prev.map((e) => e.path));
          const newEntries = children.filter((c: DirEntry) => !existingPaths.has(c.path));
          return [...prev, ...newEntries];
        });
      }
    } catch {
      // Silently ignore — folder may be empty
    }
  }, []);

  // Build flat list for FlatList with depth-based indentation
  const flatData = useMemo(() => {
    if (!currentWorkspace) return [];

    const buildFlat = (entries: DirEntry[], parentPath: string, depth: number): FlatItem[] => {
      const result: FlatItem[] = [];
      const children = entries
        .filter((e) => {
          // Direct children of parentPath
          const parent = e.path.substring(0, e.path.lastIndexOf('/')) || '/';
          return parent === parentPath;
        })
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      for (const entry of children) {
        const isExpanded = expanded.has(entry.path);
        result.push({ ...entry, depth, isExpanded });
        if (entry.isDirectory && isExpanded) {
          result.push(...buildFlat(entries, entry.path, depth + 1));
        }
      }
      return result;
    };

    return buildFlat(tree, currentWorkspace, 0);
  }, [tree, expanded, currentWorkspace]);

  const handleFileSelect = (path: string) => {
    openTab(path);
    navigation.closeDrawer();
  };

  // No workspace state
  if (!currentWorkspace) {
    return (
      <View style={[styles.container, styles.emptyContainer, { backgroundColor: background }]}>
        <Ionicons name='folder-open-outline' size={48} color={iconColor} style={{ opacity: 0.4 }} />
        <ThemedText style={styles.emptyText}>{t('workspace.noWorkspace')}</ThemedText>
      </View>
    );
  }

  const renderItem = ({ item }: { item: FlatItem }) => (
    <TouchableOpacity
      style={[styles.item, { paddingLeft: 16 + 16 * item.depth }]}
      onPress={() => (item.isDirectory ? toggleFolder(item) : handleFileSelect(item.path))}
      activeOpacity={0.6}
    >
      {item.isDirectory && (
        <Ionicons
          name={item.isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={iconColor}
          style={styles.chevron}
        />
      )}
      <Ionicons
        name={item.isDirectory ? (item.isExpanded ? 'folder-open' : 'folder') : 'document-outline'}
        size={18}
        color={item.isDirectory ? tint : iconColor}
        style={styles.icon}
      />
      <ThemedText style={styles.itemName} numberOfLines={1}>
        {item.name}
      </ThemedText>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Ionicons name='folder-outline' size={18} color={tint} />
        <ThemedText style={styles.headerTitle} numberOfLines={1}>
          {workspaceDisplayName}
        </ThemedText>
        <TouchableOpacity onPress={() => navigation.closeDrawer()}>
          <Ionicons name='close' size={22} color={iconColor} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size='small' color={tint} style={styles.loader} />
      ) : (
        <FlatList
          data={flatData}
          renderItem={renderItem}
          keyExtractor={(item) => item.path}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <ThemedText type='caption'>{t('files.empty')}</ThemedText>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  loader: {
    marginTop: 40,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 16,
  },
  chevron: {
    marginRight: 4,
    width: 14,
  },
  icon: {
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    flex: 1,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
  },
  emptyList: {
    padding: 40,
    alignItems: 'center',
  },
});
