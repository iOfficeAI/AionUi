/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { emitter } from '@/renderer/utils/emitter';
import { dispatchWorkspaceHasFilesEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectedNodeRef } from '../types';
import { applyFreshListings, collectExpandedDirs, getFirstLevelKeys } from '../utils/treeHelpers';
import { getWorkspaceTreeSnapshot, setWorkspaceTreeSnapshot } from '../utils/workspaceTreeCache';

interface UseWorkspaceTreeOptions {
  workspace: string;
  conversation_id: string;
  eventPrefix: 'acp' | 'codex' | 'aionrs';
}

/**
 * useWorkspaceTree - 合并树状态管理和选择逻辑
 * Merge tree state management and selection logic
 */
export function useWorkspaceTree({ workspace, conversation_id, eventPrefix }: UseWorkspaceTreeOptions) {
  // Hydrate initial state from the per-workspace cache so switching between
  // conversations of the same project — or a panel remount while SWR loads —
  // restores the tree and expansion exactly as the user left it.
  const initialSnapshot = getWorkspaceTreeSnapshot(workspace);

  // Tree state / 树状态
  const [files, setFiles] = useState<IDirOrFile[]>(initialSnapshot?.files ?? []);
  const [loading, setLoading] = useState(false);
  const [treeKey, setTreeKey] = useState(Math.random());
  const [expandedKeys, setExpandedKeys] = useState<string[]>(initialSnapshot?.expandedKeys ?? []);

  // Selection state / 选中状态
  const [selected, setSelected] = useState<string[]>([]);

  // A workspace that already has a cached snapshot is not a "first load" — its
  // tree and expansion come from the cache and must not be reset to first-level.
  const isFirstLoadRef = useRef(!initialSnapshot);
  const selectedKeysRef = useRef<string[]>([]);
  const selectedNodeRef = useRef<SelectedNodeRef | null>(null);

  // Mirror the latest tree/expansion into refs so the cache can be written
  // without adding them to every callback's dependency list.
  const filesRef = useRef(files);
  const expandedKeysRef = useRef(expandedKeys);
  filesRef.current = files;
  expandedKeysRef.current = expandedKeys;

  // Persist snapshot only on unmount — writing on every files/expandedKeys
  // change copies the entire tree on each expand/collapse and causes jank in
  // large workspaces. The cache is also written after each successful refresh
  // inside loadWorkspace, so state is always recoverable.
  useEffect(() => {
    return () => {
      if (!workspace) return;
      setWorkspaceTreeSnapshot(workspace, { files: filesRef.current, expandedKeys: expandedKeysRef.current });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  // When the workspace path changes WITHOUT a component remount (switching
  // between two already-cached conversations of different projects), the
  // useState initializers above do not re-run, so `files`/`expandedKeys` would
  // still show the previous project. Re-seed them from the new workspace's
  // cached snapshot (or empty for a never-visited project) and reset the
  // first-load flag accordingly. Skips the very first render, which the
  // initializers already handled.
  const hydratedWorkspaceRef = useRef(workspace);
  useEffect(() => {
    if (hydratedWorkspaceRef.current === workspace) return;
    hydratedWorkspaceRef.current = workspace;
    const snapshot = getWorkspaceTreeSnapshot(workspace);
    setFiles(snapshot?.files ?? []);
    setExpandedKeys(snapshot?.expandedKeys ?? []);
    isFirstLoadRef.current = !snapshot;
  }, [workspace]);

  // Loading time tracker / 加载时间追踪
  const lastLoadingTime = useRef(Date.now());
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, []);

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
        loadingTimerRef.current = setTimeout(() => {
          loadingTimerRef.current = null;
          setLoading(false);
        }, 1000);
      }
    }
  }, []);

  // Track the latest request to ignore stale/aborted responses
  const loadSeqRef = useRef(0);

  /**
   * 加载工作空间文件树
   * Load workspace file tree
   *
   * A refresh re-fetches the root PLUS every currently-expanded directory in
   * parallel (getWorkspace only returns one level per call), then splices those
   * fresh listings onto the existing tree. This keeps expanded folders open
   * (expandedKeys is never cleared on refresh) and surfaces files that were
   * just created inside an expanded folder — the two problems the old "reuse
   * stale children" merge could not solve together. Search no longer goes
   * through here; it filters the flat file list on the frontend (useWorkspaceSearch).
   */
  const loadWorkspace = useCallback(
    (path: string) => {
      const seq = ++loadSeqRef.current;
      setLoadingHandler(true);

      const rootPromise = ipcBridge.conversation.getWorkspace.invoke({ path, workspace, conversation_id, search: '' });

      // Also re-fetch every expanded directory so their latest contents (incl.
      // newly created files) splice in without collapsing anything.
      const expandedDirs = collectExpandedDirs(filesRef.current, expandedKeysRef.current).filter(
        (d) => d.relativePath !== ''
      );
      const childPromises = expandedDirs.map((dir) =>
        ipcBridge.conversation.getWorkspace
          .invoke({ path: dir.fullPath, workspace, conversation_id })
          .then((res) => ({ dir, children: res[0]?.children ?? [] }))
          .catch(() => ({ dir, children: [] as IDirOrFile[] }))
      );

      return Promise.all([rootPromise, Promise.all(childPromises)])
        .then(([res, childResults]) => {
          // Ignore stale responses from superseded requests.
          if (seq !== loadSeqRef.current) {
            return res;
          }

          // Guard: on subsequent refreshes (not first load), ignore empty
          // responses when we already have files — prevents the tree from
          // flashing empty while the backend is temporarily unable to read the
          // workspace (e.g. concurrent file operations by another agent).
          const isEmpty = res.length === 0 || (res[0]?.children?.length ?? 0) === 0;
          if (!isFirstLoadRef.current && isEmpty) {
            return res;
          }

          // Compute new files and expandedKeys synchronously so we can write
          // the cache with the correct post-update values in the same tick.
          const newFiles: IDirOrFile[] = isFirstLoadRef.current
            ? res
            : applyFreshListings(
                filesRef.current,
                (() => {
                  const m = new Map<string, IDirOrFile[]>();
                  m.set('', res[0]?.children ?? []);
                  for (const { dir, children } of childResults) m.set(dir.relativePath, children);
                  return m;
                })()
              );

          const newExpandedKeys: string[] = isFirstLoadRef.current
            ? getFirstLevelKeys(res)
            : [...new Set([...expandedKeysRef.current, ...getFirstLevelKeys(res)])];

          setFiles(newFiles);
          setExpandedKeys(newExpandedKeys);

          // 根据是否有文件决定工作空间面板的展开/折叠状态
          // Determine workspace panel expand/collapse state based on files
          const hasFiles = res.length > 0 && (res[0]?.children?.length ?? 0) > 0;

          const wasFirstLoad = isFirstLoadRef.current;
          if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
          }

          // Only dispatch expand signal when there are files; never actively
          // collapse — avoids fighting with team mode's explicit expand and
          // prevents flicker when workspace starts empty.
          if (hasFiles) {
            dispatchWorkspaceHasFilesEvent(true, conversation_id, wasFirstLoad);
          }

          // Persist the freshly-computed snapshot so the cache is up to date
          // after every successful refresh (not just on unmount).
          if (workspace) {
            setWorkspaceTreeSnapshot(workspace, { files: newFiles, expandedKeys: newExpandedKeys });
          }

          return res;
        })
        .catch((err) => {
          // Prevent unhandled rejection when workspace directory is missing (ENOENT)
          console.error('[useWorkspaceTree] loadWorkspace failed:', err);
          return [] as IDirOrFile[];
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
