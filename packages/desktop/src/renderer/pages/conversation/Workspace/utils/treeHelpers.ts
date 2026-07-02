/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import type { NodeInstance } from '@arco-design/web-react/es/Tree/interface';

/**
 * 从 Tree 节点中提取数据引用
 * Extract data reference from Tree node
 */
export function extractNodeData(node: NodeInstance | null | undefined): IDirOrFile | null {
  if (!node) return null;
  const props = node.props as { dataRef?: IDirOrFile; _data?: IDirOrFile };
  return props?.dataRef ?? props?._data ?? null;
}

/**
 * 从 Tree 节点中提取 key（优先使用 relativePath）
 * Extract key from Tree node (prefer relativePath)
 */
export function extractNodeKey(node: NodeInstance | null | undefined): string | null {
  if (!node) return null;
  const dataRef = extractNodeData(node);
  if (dataRef?.relativePath) {
    return dataRef.relativePath;
  }
  const { key } = node;
  return key == null ? null : String(key);
}

/**
 * 根据路径判断平台分隔符
 * Detect correct path separator by platform based on path
 */
export function getPathSeparator(targetPath: string): string {
  return targetPath.includes('\\') ? '\\' : '/';
}

/**
 * 在树中查找节点（通过 relativePath）
 * Find node in tree by relativePath
 */
export function findNodeByKey(list: IDirOrFile[], key: string): IDirOrFile | null {
  for (const item of list) {
    if (item.relativePath === key) return item;
    if (item.children && item.children.length > 0) {
      const found = findNodeByKey(item.children, key);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Merge children that were lazy-loaded in the old tree back into a freshly
 * fetched tree. The backend's getWorkspace only returns one level at a time;
 * a full refresh of the root therefore arrives with deep dirs collapsed to
 * empty children, even when the user had expanded them via loadMore.
 *
 * For every directory node in the new tree that has no children loaded, we
 * substitute the old node's children (matched by relativePath). Files are
 * left untouched. Dirs that were deleted on disk simply don't appear in the
 * new tree, so they drop out naturally.
 */
export function mergeLoadedChildren(newRes: IDirOrFile[], oldFiles: IDirOrFile[]): IDirOrFile[] {
  if (oldFiles.length === 0) return newRes;

  const oldByPath = new Map<string, IDirOrFile>();
  const indexNode = (n: IDirOrFile) => {
    if (n.relativePath != null) oldByPath.set(n.relativePath, n);
    n.children?.forEach(indexNode);
  };
  oldFiles.forEach(indexNode);

  const visit = (node: IDirOrFile): IDirOrFile => {
    if (node.isFile) return node;
    const oldNode = node.relativePath != null ? oldByPath.get(node.relativePath) : undefined;
    const newHasChildren = (node.children?.length ?? 0) > 0;
    const oldHasChildren = (oldNode?.children?.length ?? 0) > 0;

    if (newHasChildren) {
      return { ...node, children: node.children!.map(visit) };
    }
    if (oldHasChildren) {
      return { ...node, children: oldNode!.children };
    }
    return node;
  };

  return newRes.map(visit);
}

/**
 * 获取第一层节点的 keys（用于初始展开）
 * Get first level node keys (for initial expansion)
 */
export function getFirstLevelKeys(nodes: IDirOrFile[]): string[] {
  if (nodes.length > 0 && nodes[0].relativePath === '') {
    // 如果第一个节点是根节点（relativePath 为空），展开它
    // If first node is root (empty relativePath), expand it
    return [''];
  }
  return [];
}

/**
 * Recursively collect all file paths from tree items
 */
export function collectFilePaths(items: IDirOrFile[]): string[] {
  const paths: string[] = [];
  for (const item of items) {
    if (item.isFile && item.fullPath) {
      paths.push(item.fullPath);
    }
    if (item.children && item.children.length > 0) {
      paths.push(...collectFilePaths(item.children));
    }
  }
  return paths;
}

/**
 * If there's only one root directory with children, return its children directly.
 * Used to hide root directory when Toolbar serves as first-level directory.
 */
export function flattenSingleRoot(files: IDirOrFile[]): IDirOrFile[] {
  if (files.length === 1 && (files[0]?.children?.length ?? 0) > 0) {
    return files[0]?.children ?? [];
  }
  return files;
}

/**
 * Clip context menu position to viewport boundaries
 */
export function computeContextMenuPosition(
  x: number,
  y: number,
  menuWidth = 220,
  menuHeight = 220
): { top: number; left: number } {
  let clippedX = x;
  let clippedY = y;
  if (typeof window !== 'undefined') {
    clippedX = Math.min(clippedX, window.innerWidth - menuWidth);
    clippedY = Math.min(clippedY, window.innerHeight - menuHeight);
  }
  return { top: clippedY, left: clippedX };
}

/**
 * 获取目标文件夹路径（从 selectedNodeRef 或 selected keys）
 * Get target folder path from selectedNodeRef or selected keys
 */
export function getTargetFolderPath(
  selectedNodeRef: { relativePath: string; fullPath: string } | null,
  selected: string[],
  files: IDirOrFile[],
  workspace: string
): { fullPath: string; relativePath: string | null } {
  // 优先使用 selectedNodeRef / Prioritize selectedNodeRef
  if (selectedNodeRef) {
    return {
      fullPath: selectedNodeRef.fullPath,
      relativePath: selectedNodeRef.relativePath,
    };
  }

  // 回退逻辑：从 selected 中查找最深的文件夹 / Fallback: find the deepest folder from selected keys
  if (selected && selected.length > 0) {
    const folderNodes: IDirOrFile[] = [];
    for (const key of selected) {
      const node = findNodeByKey(files, key);
      if (node && !node.isFile && node.fullPath) {
        folderNodes.push(node);
      }
    }

    if (folderNodes.length > 0) {
      // 按最深的相对路径排序（路径段越多越深） / Sort by deepest relativePath (more path segments)
      folderNodes.sort((a, b) => {
        const aDepth = (a.relativePath || '').split('/').length;
        const bDepth = (b.relativePath || '').split('/').length;
        return bDepth - aDepth;
      });
      return {
        fullPath: folderNodes[0].fullPath,
        relativePath: folderNodes[0].relativePath,
      };
    }
  }

  // 默认使用工作空间根目录 / Default to workspace root
  return {
    fullPath: workspace,
    relativePath: null,
  };
}
