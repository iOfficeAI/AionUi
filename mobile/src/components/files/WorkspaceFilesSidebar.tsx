import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useConversations } from '../../context/ConversationContext';
import { useFilesTab } from '../../context/FilesTabContext';
import { useThemeColor } from '../../hooks/useThemeColor';
import { bridge } from '../../services/bridge';

type IDirOrFile = {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: IDirOrFile[];
};

type FlatItem = {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  depth: number;
  isExpanded?: boolean;
};

type WorkspaceFilesSidebarProps = {
  navigation: { closeDrawer(): void; openDrawer(): void };
};

export function WorkspaceFilesSidebar({ navigation }: WorkspaceFilesSidebarProps) {
  const { t } = useTranslation();
  const { currentWorkspace, workspaceDisplayName, workspaceChanged } = useWorkspace();
  const { activeConversationId } = useConversations();
  const { openTab } = useFilesTab();
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const iconColor = useThemeColor({}, 'icon');

  const [tree, setTree] = useState<IDirOrFile[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(async () => {
    if (!activeConversationId || !currentWorkspace) return;
    setLoading(true);
    try {
      const res = await bridge.request<IDirOrFile[]>('conversation.get-workspace', {
        conversation_id: activeConversationId,
        workspace: currentWorkspace,
        path: currentWorkspace,
        search: '',
      });
      if (Array.isArray(res)) {
        setTree(res);
      }
    } catch {
      Alert.alert(t('common.error'), t('workspace.errorLoading'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, currentWorkspace]);

  // Load files when workspace or active conversation changes
  useEffect(() => {
    if (currentWorkspace && activeConversationId) {
      setExpanded(new Set());
      void fetchFiles();
    } else {
      setTree([]);
    }
  }, [currentWorkspace, activeConversationId, fetchFiles]);

  // Reset expansion when workspace changes to different project
  useEffect(() => {
    if (workspaceChanged) {
      setExpanded(new Set());
    }
  }, [workspaceChanged]);

  const toggleExpand = useCallback((entry: { fullPath: string }) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.fullPath)) {
        next.delete(entry.fullPath);
      } else {
        next.add(entry.fullPath);
      }
      return next;
    });
  }, []);

  // Flatten the nested tree for FlatList rendering
  const flatData = useMemo(() => {
    if (!tree.length) return [];
    const rootChildren = tree[0]?.children ?? [];

    const sortNodes = (nodes: IDirOrFile[]): IDirOrFile[] =>
      [...nodes].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const flatten = (nodes: IDirOrFile[], depth: number): FlatItem[] => {
      const result: FlatItem[] = [];
      for (const node of sortNodes(nodes)) {
        const isExpanded = node.isDir && expanded.has(node.fullPath);
        result.push({
          name: node.name,
          fullPath: node.fullPath,
          relativePath: node.relativePath,
          isDir: node.isDir,
          isFile: node.isFile,
          depth,
          isExpanded,
        });
        if (isExpanded && node.children) {
          result.push(...flatten(node.children, depth + 1));
        }
      }
      return result;
    };

    return flatten(rootChildren, 0);
  }, [tree, expanded]);

  const handleFileSelect = (fullPath: string) => {
    openTab(fullPath);
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
      onPress={() => (item.isDir ? toggleExpand(item) : handleFileSelect(item.fullPath))}
      activeOpacity={0.6}
    >
      {item.isDir && (
        <Ionicons
          name={item.isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={iconColor}
          style={styles.chevron}
        />
      )}
      <Ionicons
        name={item.isDir ? (item.isExpanded ? 'folder-open' : 'folder') : 'document-outline'}
        size={18}
        color={item.isDir ? tint : iconColor}
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
          keyExtractor={(item) => item.fullPath}
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
    paddingTop: 16,
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
