/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import { emitter } from '@/renderer/utils/emitter';
import { dispatchWorkspaceHasFilesEvent } from '@/renderer/utils/workspaceEvents';
import { useCallback, useRef, useState } from 'react';
import type { SelectedNodeRef } from '../types';
import { getFirstLevelKeys } from '../utils/treeHelpers';

interface UseWorkspaceTreeOptions {
  workspace: string;
  conversation_id: string;
  eventPrefix: 'gemini' | 'acp' | 'codex';
}

/**
 * useWorkspaceTree - 合并树状态管理和选择逻辑
 * Merge tree state management and selection logic
 */
export function useWorkspaceTree({ workspace, conversation_id, eventPrefix }: UseWorkspaceTreeOptions) {
  // Tree state / 树状态
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [treeKey, setTreeKey] = useState(Math.random());
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Selection state / 选中状态
  const [selected, setSelected] = useState<string[]>([]);

  // 标记是否为首次加载（用于区分初始化和后续刷新）
  // Track if this is the first load (to distinguish initialization from subsequent refreshes)
  const isFirstLoadRef = useRef(true);
  const selectedKeysRef = useRef<string[]>([]);
  const selectedNodeRef = useRef<SelectedNodeRef | null>(null);

  // Loading time tracker / 加载时间追踪
  const lastLoadingTime = useRef(Date.now());

  /**
   * 设置 loading 状态（带防抖，避免图标闪烁）
   * Set loading state with debounce to avoid icon flickering
   */
  const setLoadingHandler = useCallback((newState: boolean) => {
    if (newState) {
      lastLoadingTime.current = Date.now();
      setLoading(true);
    } else {
      // 确保loading动画保持至少1秒 / Ensure loading animation lasts at least 1 second
      if (Date.now() - lastLoadingTime.current > 1000) {
        setLoading(false);
      } else {
        setTimeout(() => {
          setLoading(false);
        }, 1000);
      }
    }
  }, []);

  /**
   * 加载工作空间文件树
   * Load workspace file tree
   */
  const loadWorkspace = useCallback(
    (path: string, search?: string) => {
      setLoadingHandler(true);
      return ipcBridge.conversation.getWorkspace
        .invoke({ path, workspace, conversation_id, search: search || '' })
        .then((res) => {
          setFiles(res);
          // 只在搜索时才重置 Tree key，否则保持选中状态
          // Only reset Tree key when searching, otherwise keep selection state
          if (search) {
            setTreeKey(Math.random());
          }

          // 只展开第一层文件夹（根节点）
          // Only expand first level folders (root node)
          setExpandedKeys(getFirstLevelKeys(res));

          // 根据是否有文件决定工作空间面板的展开/折叠状态
          // Determine workspace panel expand/collapse state based on files
          const hasFiles = res.length > 0 && (res[0]?.children?.length ?? 0) > 0;

          if (isFirstLoadRef.current) {
            // 首次加载（切换会话或打开会话）：有文件展开，没文件折叠
            // First load (switch or open conversation): expand if has files, collapse if not
            dispatchWorkspaceHasFilesEvent(hasFiles, conversation_id);
            isFirstLoadRef.current = false;
          } else {
            // 后续刷新（Agent 生成文件等）：有文件就展开，不主动折叠
            // Subsequent refresh (agent generates files, etc.): expand if has files, never collapse
            if (hasFiles) {
              dispatchWorkspaceHasFilesEvent(true, conversation_id);
            }
          }

          return res;
        })
        .finally(() => {
          setLoadingHandler(false);
        });
    },
    [conversation_id, workspace, setLoadingHandler]
  );

  /**
   * 刷新工作空间
   * Refresh workspace
   */
  const refreshWorkspace = useCallback(() => {
    return loadWorkspace(workspace);
  }, [workspace, loadWorkspace]);

  /**
   * 确保节点被选中，并可选地发送事件
   * Ensure node is selected and optionally emit event
   */
  const ensureNodeSelected = useCallback(
    (nodeData: IDirOrFile, options?: { emit?: boolean }) => {
      const key = nodeData.relativePath;
      const shouldEmit = Boolean(options?.emit);

      if (!key) {
        setSelected([]);
        selectedKeysRef.current = [];
        if (!nodeData.isFile && nodeData.fullPath) {
          // 记录最后选中的文件夹 / Remember the latest selected folder
          selectedNodeRef.current = {
            relativePath: key ?? '',
            fullPath: nodeData.fullPath,
          };
        }
        if (shouldEmit && nodeData.fullPath) {
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: nodeData.isFile,
              relativePath: nodeData.relativePath,
            },
          ]);
        } else if (shouldEmit) {
          emitter.emit(`${eventPrefix}.selected.file`, []);
        }
        return;
      }

      setSelected([key]);
      selectedKeysRef.current = [key];

      if (!nodeData.isFile) {
        selectedNodeRef.current = {
          relativePath: key,
          fullPath: nodeData.fullPath,
        };
        if (shouldEmit && nodeData.fullPath) {
          // 将文件夹对象发给发送框 / Emit folder object to send box
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: false,
              relativePath: nodeData.relativePath,
            },
          ]);
        }
      } else if (nodeData.fullPath) {
        selectedNodeRef.current = null;
        if (shouldEmit) {
          // 选中文件时，将文件信息广播 / Broadcast file info when selected
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: true,
              relativePath: nodeData.relativePath,
            },
          ]);
        }
      }
    },
    [eventPrefix]
  );

  /**
   * 清空选中状态
   * Clear selection state
   */
  const clearSelection = useCallback(() => {
    setSelected([]);
    selectedKeysRef.current = [];
    selectedNodeRef.current = null;
  }, []);

  return {
    // State / 状态
    files,
    loading,
    treeKey,
    expandedKeys,
    selected,
    selectedKeysRef,
    selectedNodeRef,

    // Actions / 操作
    setFiles,
    setTreeKey,
    setExpandedKeys,
    setSelected,
    loadWorkspace,
    refreshWorkspace,
    ensureNodeSelected,
    clearSelection,
  };
}
