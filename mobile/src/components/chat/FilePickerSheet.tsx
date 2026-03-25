import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
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

type FilePickerSheetProps = {
  visible: boolean;
  rootDir: string;
  selectedFiles: string[];
  onDone: (files: string[]) => void;
  onClose: () => void;
};

export function FilePickerSheet({
  visible,
  rootDir,
  selectedFiles,
  onDone,
  onClose,
}: FilePickerSheetProps) {
  const { t } = useTranslation();
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const iconColor = useThemeColor({}, 'icon');

  const [tree, setTree] = useState<IDirOrFile[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedFiles));
  const [loading, setLoading] = useState(false);

  const dir = rootDir || '/';

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bridge.request<IDirOrFile[]>('get-file-by-dir', {
        dir,
        root: dir,
      });
      if (Array.isArray(res)) {
        setTree(res);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [dir]);

  useEffect(() => {
    if (visible) {
      setSelected(new Set(selectedFiles));
      setExpanded(new Set());
      void fetchFiles();
    }
  }, [visible, fetchFiles, selectedFiles]);

  const toggleExpand = useCallback((fullPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) {
        next.delete(fullPath);
      } else {
        next.add(fullPath);
      }
      return next;
    });
  }, []);

  const toggleSelect = useCallback((fullPath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) {
        next.delete(fullPath);
      } else {
        next.add(fullPath);
      }
      return next;
    });
  }, []);

  const flatData = useMemo(() => {
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

    return flatten(tree, 0);
  }, [tree, expanded]);

  const handleDone = () => {
    onDone(Array.from(selected));
    onClose();
  };

  const selectedCount = selected.size;

  const renderItem = ({ item }: { item: FlatItem }) => (
    <TouchableOpacity
      style={[styles.item, { paddingLeft: 16 + 16 * item.depth }]}
      onPress={() => (item.isDir ? toggleExpand(item.fullPath) : toggleSelect(item.fullPath))}
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
      {item.isFile && (
        <Ionicons
          name={selected.has(item.fullPath) ? 'checkbox' : 'square-outline'}
          size={22}
          color={selected.has(item.fullPath) ? tint : iconColor}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType='slide' transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: background }]}>
          <View style={[styles.header, { borderBottomColor: border }]}>
            <ThemedText style={styles.title}>{t('chat.browseFiles')}</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <ThemedText style={[styles.closeButton, { color: tint }]}>
                {t('common.close')}
              </ThemedText>
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
                <View style={styles.empty}>
                  <ThemedText type='caption'>{t('files.empty')}</ThemedText>
                </View>
              }
            />
          )}

          <View style={[styles.footer, { borderTopColor: border }]}>
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: tint }]}
              onPress={handleDone}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.doneText}>
                {t('chat.done')}
                {selectedCount > 0 && ` (${selectedCount})`}
              </ThemedText>
            </TouchableOpacity>
          </View>
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
    maxHeight: '80%',
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
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
  },
  doneButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
