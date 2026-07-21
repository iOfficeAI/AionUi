/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile, IWorkspaceFlatFile } from '@/common/adapter/ipcBridge';
import type { NodeInstance } from '@arco-design/web-react/es/Tree/interface';

const normalizeSlashes = (p: string): string => p.replace(/\\/g, '/');
const stripTrailingSlash = (p: string): string => p.replace(/\/+$/, '');

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
 * Apply freshly-fetched directory listings onto the current tree, matched by
 * relativePath. `freshByPath` maps a directory's relativePath to the latest
 * direct-children array returned by getWorkspace for that directory (only the
 * root and the dirs the user has expanded are re-fetched on a refresh).
 *
 * For a re-fetched directory, its fresh listing is authoritative: new files
 * appear, deleted ones drop out. For each fresh child directory we carry over
 * the old node's already-loaded children (matched by path) so collapsed
 * subtrees are not thrown away — they simply lazy-load again on next expand if
 * they were never loaded. Directories NOT in the map keep their existing
 * children untouched. Nothing the user expanded ever collapses, because the
 * expanded state (expandedKeys) is preserved separately and every fresh child
 * dir retains its identity by relativePath.
 */
export function applyFreshListings(nodes: IDirOrFile[], freshByPath: Map<string, IDirOrFile[]>): IDirOrFile[] {
  const visit = (node: IDirOrFile): IDirOrFile => {
    if (node.isFile) return node;
    const fresh = node.relativePath != null ? freshByPath.get(node.relativePath) : undefined;
    if (fresh) {
      const oldChildrenByPath = new Map<string, IDirOrFile>();
      node.children?.forEach((c) => {
        if (c.relativePath != null) oldChildrenByPath.set(c.relativePath, c);
      });
      const merged = fresh.map((fc) => {
        if (fc.isFile) return fc;
        const old = fc.relativePath != null ? oldChildrenByPath.get(fc.relativePath) : undefined;
        const carried = old?.children && old.children.length > 0 ? { ...fc, children: old.children } : fc;
        return visit(carried);
      });
      return { ...node, children: merged };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: node.children.map(visit) };
    }
    return node;
  };
  return nodes.map(visit);
}

/**
 * Collect the directory nodes that are currently expanded AND already have
 * children loaded, so a refresh can re-fetch exactly those folders. Returns
 * `{ relativePath, fullPath }` pairs. The root (relativePath '') is always
 * included because it is fetched as the refresh baseline anyway.
 */
export function collectExpandedDirs(
  nodes: IDirOrFile[],
  expandedKeys: string[]
): Array<{ relativePath: string; fullPath: string }> {
  const expandedSet = new Set(expandedKeys);
  const result: Array<{ relativePath: string; fullPath: string }> = [];
  const visit = (node: IDirOrFile) => {
    if (node.isFile) return;
    if (node.relativePath != null && expandedSet.has(node.relativePath) && node.fullPath) {
      result.push({ relativePath: node.relativePath, fullPath: node.fullPath });
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}

/**
 * Build a tree that contains only the files whose name or path matches the
 * search term, keeping the directory nodes on the path to each match so the
 * result renders as a normal (pruned) tree. Directories themselves are matched
 * by name too, in which case their whole subtree is not expanded here — only
 * the branch nodes leading to file matches are reconstructed. Input is the
 * flat recursive file list from `fs.listWorkspaceFiles`.
 *
 * Returns `{ tree, expandedKeys }` where the tree mirrors getWorkspace's shape
 * (single root node with `relativePath === ''`) and expandedKeys expands every
 * branch so all matches are visible without manual clicking.
 */
export function buildSearchTree(
  flatFiles: IWorkspaceFlatFile[],
  workspace: string,
  term: string
): { tree: IDirOrFile[]; expandedKeys: string[] } {
  const ws = stripTrailingSlash(normalizeSlashes(workspace));
  const rootName = ws.split('/').pop() || '';
  const needle = term.trim().toLowerCase();

  const root: IDirOrFile = {
    name: rootName,
    fullPath: ws,
    relativePath: '',
    isDir: true,
    isFile: false,
    children: [],
  };
  if (!needle) return { tree: [root], expandedKeys: [''] };

  const expanded = new Set<string>(['']);
  // Map of relativePath -> directory node, so we build each branch only once.
  const dirByPath = new Map<string, IDirOrFile>();
  dirByPath.set('', root);

  const ensureDir = (relPath: string): IDirOrFile => {
    const existing = dirByPath.get(relPath);
    if (existing) return existing;
    const segments = relPath.split('/');
    const name = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join('/');
    const parent = ensureDir(parentPath);
    const node: IDirOrFile = {
      name,
      fullPath: `${ws}/${relPath}`,
      relativePath: relPath,
      isDir: true,
      isFile: false,
      children: [],
    };
    parent.children!.push(node);
    dirByPath.set(relPath, node);
    expanded.add(relPath);
    return node;
  };

  for (const file of flatFiles) {
    const relPath = normalizeSlashes(file.relativePath || '');
    if (!relPath) continue;
    // Match on file name OR any segment of its path, so searching a folder
    // name surfaces the files inside it too.
    if (!relPath.toLowerCase().includes(needle)) continue;

    const segments = relPath.split('/');
    const parentPath = segments.slice(0, -1).join('/');
    const parent = ensureDir(parentPath);
    parent.children!.push({
      name: segments[segments.length - 1],
      fullPath: file.fullPath,
      relativePath: relPath,
      isDir: false,
      isFile: true,
    });
  }

  return { tree: [root], expandedKeys: [...expanded] };
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
