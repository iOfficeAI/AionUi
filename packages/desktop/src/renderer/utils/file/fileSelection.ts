/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { localFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export type FileSelectionItem = string | FileOrFolderItem;

/**
 * Wrap backend-machine picker paths (native dialog in Electron / server-fs browse
 * in WebUI) as selection items tagged with a `local` chatRef, so the send path
 * emits them as `local` refs (absolute backend paths, sent as-is) rather than
 * `upload` refs — which the backend would reject as outside its managed upload
 * directory. Empty paths are dropped.
 */
export const localSelectionItems = (paths: string[]): FileOrFolderItem[] =>
  paths
    .filter((path) => Boolean(path))
    .map((path) => ({
      path,
      name: path.split(/[\\/]/).pop() || path,
      isFile: true,
      chatRef: localFileRef(path),
    }));

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

const WINDOWS_ABSOLUTE_PATH_RE = /^[A-Za-z]:[\\/]/;

const isAbsoluteLocalPath = (path: string): boolean =>
  WINDOWS_ABSOLUTE_PATH_RE.test(path) || path.startsWith('\\\\') || path.startsWith('//') || path.startsWith('/');

const normalizePathForComparison = (path: string): string => {
  const slashNormalized = path.replace(/\\/g, '/');
  const normalized = slashNormalized.replace(/\/+$/, '') || '/';
  const isWindowsPath = WINDOWS_ABSOLUTE_PATH_RE.test(path) || path.startsWith('\\\\') || path.startsWith('//');
  return isWindowsPath ? normalized.toLowerCase() : normalized;
};

const isPathWithinRoot = (path: string, root: string): boolean => {
  const normalizedPath = normalizePathForComparison(path);
  const normalizedRoot = normalizePathForComparison(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
};

const getParentDirectory = (path: string): string | undefined => {
  const lastSeparator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (lastSeparator < 0) return undefined;
  if (lastSeparator === 0) return '/';
  if (lastSeparator === 2 && WINDOWS_ABSOLUTE_PATH_RE.test(path)) return path.slice(0, 3);
  return path.slice(0, lastSeparator);
};

/**
 * Select the narrowest backend read root for a local file.
 *
 * Agent artifacts may live outside the conversation workspace. In particular,
 * Grok stores generated images below `~/.grok`, which can itself be a junction
 * to another drive. Passing the artifact's parent lets the backend validate the
 * canonical target without granting access to the rest of that drive.
 */
export const resolveLocalFileReadRoot = (path: string, workspace?: string): string | undefined => {
  if (!isAbsoluteLocalPath(path)) return workspace;
  if (workspace && isPathWithinRoot(path, workspace)) return workspace;
  return getParentDirectory(path) ?? workspace;
};

/**
 * Dedup key for a selection item. Project Explorer items are keyed by their pe
 * identity (`chatRef`) so the same `relative_path` under different pes stays
 * distinct and never collides with an upload sharing that path string; uploads
 * and `@` mentions key by their absolute path.
 */
const getItemPath = (item: FileSelectionItem): string | undefined => {
  if (typeof item === 'string') {
    return item;
  }
  if (item.chatRef?.kind === 'project') {
    return `project\0${item.chatRef.pe_id}\0${item.chatRef.relative_path}`;
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
