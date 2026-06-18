/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export type FileSelectionItem = string | FileOrFolderItem;

/**
 * 剥离 Windows 扩展长度路径前缀（`\\?\C:\DEV` → `C:\DEV`，`\\?\UNC\srv\share` → `\\srv\share`）
 * Strip the Windows extended-length (verbatim) prefix. Older backend builds
 * canonicalized picker paths into this form, which breaks agent spawning and
 * splits one directory into two project-list entries (issue #3191).
 */
export const stripWindowsVerbatimPrefix = (path: string): string => {
  if (path.startsWith('\\\\?\\UNC\\')) {
    return '\\\\' + path.slice('\\\\?\\UNC\\'.length);
  }
  if (path.startsWith('\\\\?\\')) {
    return path.slice('\\\\?\\'.length);
  }
  return path;
};

const getItemPath = (item: FileSelectionItem): string | undefined => {
  if (typeof item === 'string') {
    return item;
  }
  return item.path;
};

/**
 * 合并工作空间文件/文件夹选择，去重并保留元数据
 * Merge workspace selections while deduplicating and keeping richer metadata when available
 */
export const mergeFileSelectionItems = (
  current: FileSelectionItem[],
  additions: FileSelectionItem[]
): FileSelectionItem[] => {
  if (!Array.isArray(additions) || additions.length === 0) {
    return current;
  }

  const result = [...current];
  const pathToIndex = new Map<string, number>();
  for (let i = 0; i < current.length; i += 1) {
    const path = getItemPath(current[i]);
    if (path) {
      pathToIndex.set(path, i);
    }
  }

  let changed = false;

  additions.forEach((item) => {
    if (!item) return;
    const path = getItemPath(item);
    if (!path) return;

    if (pathToIndex.has(path)) {
      const idx = pathToIndex.get(path)!;
      const existing = result[idx];
      if (typeof existing === 'string' && typeof item !== 'string') {
        result[idx] = item;
        changed = true;
      }
      return;
    }

    pathToIndex.set(path, result.length);
    result.push(item);
    changed = true;
  });

  return changed ? result : current;
};
