/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/ipcBridge';
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
 * 替换路径列表中的旧路径为新路径
 * Replace old path with new path in path list
 */
export function replacePathInList(keys: string[], oldPath: string, newPath: string): string[] {
  return keys.map((key) => {
    if (key === oldPath) return newPath;
    if (key.startsWith(oldPath + '/')) {
      return newPath + key.slice(oldPath.length);
    }
    return key;
  });
}

/**
 * 递归更新子节点路径（用于重命名后更新整棵树）
 * Recursively update children paths (for tree update after rename)
 */
export function updateChildrenPaths(children: IDirOrFile[] | undefined, oldFullPrefix: string, newFullPrefix: string, oldRelativePrefix: string, newRelativePrefix: string): IDirOrFile[] | undefined {
  if (!children) return undefined;

  return children.map((child) => {
    const updatedChild = { ...child };

    // 更新 fullPath / Update fullPath
    if (child.fullPath.startsWith(oldFullPrefix)) {
      updatedChild.fullPath = newFullPrefix + child.fullPath.slice(oldFullPrefix.length);
    }

    // 更新 relativePath / Update relativePath
    if (child.relativePath && child.relativePath.startsWith(oldRelativePrefix)) {
      updatedChild.relativePath = newRelativePrefix + child.relativePath.slice(oldRelativePrefix.length);
    }

    // 递归更新子节点 / Recursively update children
    if (child.children) {
      updatedChild.children = updateChildrenPaths(child.children, oldFullPrefix, newFullPrefix, oldRelativePrefix, newRelativePrefix);
    }

    return updatedChild;
  });
}

/**
 * 递归更新树中的节点（用于重命名）
 * Recursively update node in tree (for rename)
 */
export function updateTreeForRename(list: IDirOrFile[], oldKey: string, newName: string, newFullPath: string): IDirOrFile[] {
  return list.map((node) => {
    if (node.relativePath === oldKey) {
      // 找到目标节点，更新它的信息 / Found target node, update its info
      const oldFullPath = node.fullPath;
      const oldRelativePath = node.relativePath || '';
      const newRelativePath = oldRelativePath.replace(/[^/]+$/, newName);

      const updatedNode: IDirOrFile = {
        ...node,
        name: newName,
        fullPath: newFullPath,
        relativePath: newRelativePath,
      };

      // 如果有子节点，递归更新子节点的路径 / If has children, recursively update their paths
      if (node.children && node.children.length > 0) {
        const separator = getPathSeparator(oldFullPath);
        const oldFullPrefix = oldFullPath + separator;
        const newFullPrefix = newFullPath + separator;
        const oldRelativePrefix = oldRelativePath + '/';
        const newRelativePrefix = newRelativePath + '/';

        updatedNode.children = updateChildrenPaths(node.children, oldFullPrefix, newFullPrefix, oldRelativePrefix, newRelativePrefix);
      }

      return updatedNode;
    }

    // 递归检查子节点 / Recursively check children
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateTreeForRename(node.children, oldKey, newName, newFullPath),
      };
    }

    return node;
  });
}

/**
 * 获取目标文件夹路径（从 selectedNodeRef 或 selected keys）
 * Get target folder path from selectedNodeRef or selected keys
 */
export function getTargetFolderPath(selectedNodeRef: { relativePath: string; fullPath: string } | null, selected: string[], files: IDirOrFile[], workspace: string): { fullPath: string; relativePath: string | null } {
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
