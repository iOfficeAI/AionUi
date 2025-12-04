/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { TFunction } from 'i18next';
import { ipcBridge } from '@/common';
import { FileService } from '@/renderer/services/FileService';
import type { MessageApi } from '../types';

interface UseWorkspaceDragImportOptions {
  onFilesDropped: (files: Array<{ path: string; name: string }>) => Promise<void> | void;
  messageApi: MessageApi;
  t: TFunction<'translation'>;
}

interface DroppedItem {
  path: string;
  name: string;
  kind: 'file' | 'directory';
}

const getBaseName = (targetPath: string): string => {
  const parts = targetPath.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts.pop() || targetPath;
};

const dedupeItems = (items: DroppedItem[]): DroppedItem[] => {
  const map = new Map<string, DroppedItem>();
  for (const item of items) {
    if (!map.has(item.path)) {
      map.set(item.path, item);
    }
  }
  return Array.from(map.values());
};

export function useWorkspaceDragImport({ onFilesDropped, messageApi, t }: UseWorkspaceDragImportOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDragging(false);
  }, []);

  const handleDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isDragging) {
        setIsDragging(true);
      }
    },
    [isDragging]
  );

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const createTempItemsFromFiles = useCallback(async (files: File[]): Promise<DroppedItem[]> => {
    if (!files.length) return [];
    const pseudoList = Object.assign([...files], {
      length: files.length,
      item: (index: number) => files[index] || null,
    }) as unknown as FileList;

    const processed = await FileService.processDroppedFiles(pseudoList);
    return processed.map((meta) => ({ path: meta.path, name: meta.name, kind: 'file' }));
  }, []);

  /**
   * 解析拖拽的项目，检测是文件还是目录
   * Resolve dropped items, detect whether they are files or directories
   */
  const resolveDroppedItems = useCallback(async (items: DroppedItem[]): Promise<DroppedItem[]> => {
    const unique = new Map<string, DroppedItem>();

    for (const item of items) {
      try {
        const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path: item.path });
        const itemName = metadata.name || item.name || getBaseName(item.path);
        const kind = metadata.isDirectory ? 'directory' : 'file';
        unique.set(item.path, { path: item.path, name: itemName, kind });
      } catch (error) {
        console.warn('[WorkspaceDragImport] Failed to inspect dropped path:', item.path, error);
        const fallbackName = item.name || getBaseName(item.path);
        unique.set(item.path, { path: item.path, name: fallbackName, kind: 'file' });
      }
    }

    return Array.from(unique.values());
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resetDragState();

      const dataTransfer = event.dataTransfer || event.nativeEvent?.dataTransfer;
      const itemsWithPath: DroppedItem[] = [];
      const filesWithoutPath: File[] = [];

      if (dataTransfer?.files && dataTransfer.files.length > 0) {
        for (let i = 0; i < dataTransfer.files.length; i++) {
          const file = dataTransfer.files[i];

          // 使用 Electron webUtils.getPathForFile API 获取文件/目录的绝对路径
          // Use Electron webUtils.getPathForFile API to get absolute path for file/directory
          let filePath: string | undefined;
          if (window.electronAPI?.getPathForFile) {
            try {
              filePath = window.electronAPI.getPathForFile(file);
            } catch (err) {
              console.warn('[WorkspaceDragImport] getPathForFile failed:', err);
            }
          }

          // 回退到 File.path 属性（旧版 Electron 或非 Electron 环境）
          // Fallback to File.path property (older Electron or non-Electron)
          if (!filePath) {
            const electronFile = file as File & { path?: string };
            filePath = electronFile.path;
          }

          if (filePath) {
            const name = file.name || getBaseName(filePath);
            itemsWithPath.push({ path: filePath, name, kind: 'file' });
          } else {
            // 没有 path 属性，可能是从浏览器拖拽或非 Electron 环境
            // 检查是否是目录（通过 webkitGetAsEntry）
            // No path property, might be from browser or non-Electron
            // Check if it's a directory (via webkitGetAsEntry)
            const item = dataTransfer.items?.[i];
            const entry = item?.webkitGetAsEntry?.();
            if (entry?.isDirectory) {
              // 目录但没有 path，无法处理
              console.warn('[WorkspaceDragImport] Directory without path property, cannot process:', entry.name);
            } else {
              // 普通文件，需要创建临时文件
              filesWithoutPath.push(file);
            }
          }
        }
      }

      let tempItems: DroppedItem[] = [];
      if (filesWithoutPath.length > 0) {
        try {
          tempItems = await createTempItemsFromFiles(filesWithoutPath);
        } catch (error) {
          console.error('[WorkspaceDragImport] Failed to create temp files:', error);
        }
      }

      const dedupedWithPath = dedupeItems(itemsWithPath);
      const targets = dedupedWithPath.length > 0 ? await resolveDroppedItems(dedupedWithPath) : tempItems;

      if (targets.length === 0) {
        messageApi.warning(
          t('conversation.workspace.dragNoFiles', {
            defaultValue: 'No valid files detected. Please drag from Finder/Explorer.',
          })
        );
        return;
      }

      try {
        await onFilesDropped(targets.map(({ path, name }) => ({ path, name })));
      } catch (error) {
        console.error('Failed to import dropped files:', error);
        messageApi.error(
          t('conversation.workspace.dragFailed', {
            defaultValue: 'Failed to import dropped files.',
          })
        );
      }
    },
    [resolveDroppedItems, createTempItemsFromFiles, messageApi, onFilesDropped, resetDragState, t]
  );

  const dragHandlers = {
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return {
    isDragging,
    dragHandlers,
  };
}
