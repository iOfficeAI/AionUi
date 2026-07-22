/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useRef } from 'react';
import type { ContextMenuState } from '../types';

interface UseWorkspaceEventsOptions {
  conversation_id: string;
  workspace: string;
  eventPrefix: 'acp' | 'codex' | 'aionrs';

  // Dependencies from useWorkspaceTree
  refreshWorkspace: () => void;
  clearSelection: () => void;
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  setTreeKey: React.Dispatch<React.SetStateAction<number>>;
  selectedNodeRef: React.MutableRefObject<{
    relativePath: string;
    fullPath: string;
  } | null>;
  selectedKeysRef: React.MutableRefObject<string[]>;

  // Dependencies from useWorkspaceModals
  closeContextMenu: () => void;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  closeRenameModal: () => void;
  closeDeleteModal: () => void;
}

/**
 * useWorkspaceEvents - 管理所有事件监听器
 * Manage all event listeners
 */
export function useWorkspaceEvents(options: UseWorkspaceEventsOptions) {
  const {
    conversation_id,
    workspace,
    eventPrefix,
    refreshWorkspace,
    clearSelection,
    setSelected,
    setTreeKey,
    selectedNodeRef,
    selectedKeysRef,
    closeContextMenu,
    setContextMenu,
    closeRenameModal,
    closeDeleteModal,
  } = options;

  /**
   * Reset + reload the tree only when the PROJECT DIRECTORY changes, not on
   * every conversation switch. The sidebar groups conversations by workspace,
   * so switching between conversations of the same project keeps the same
   * directory on screen — its tree, expansion, and freshly-appeared files must
   * stay put. useWorkspaceTree rehydrates that state from the per-workspace
   * cache, so here we only wipe the tree when moving to a different project
   * (or to a conversation with no workspace).
   */
  const prevWorkspaceRef = useRef<string | null>(null);
  useEffect(() => {
    const workspaceChanged = prevWorkspaceRef.current !== workspace;
    prevWorkspaceRef.current = workspace;

    // Close transient UI (context menu, modals) on any conversation switch.
    setContextMenu({ visible: false, x: 0, y: 0, node: null });
    closeRenameModal();
    closeDeleteModal();

    if (workspaceChanged) {
      // New project: clear everything and load from scratch. useWorkspaceTree
      // seeds files/expandedKeys from the cache if this project was visited
      // before, so refreshWorkspace re-fetches without collapsing it.
      setSelected([]);
      selectedNodeRef.current = null;
      selectedKeysRef.current = [];
      setTreeKey(Math.random());
      refreshWorkspace();
    } else {
      // Same project, different conversation: keep the tree and expansion, but
      // drop the selection — "add to chat" selections belong to the previous
      // conversation's send box and must not leak into this one. Still refresh
      // so files created in the now-active conversation show up.
      setSelected([]);
      selectedNodeRef.current = null;
      selectedKeysRef.current = [];
      refreshWorkspace();
    }
    emitter.emit(`${eventPrefix}.selected.file`, []);
  }, [
    conversation_id,
    workspace,
    eventPrefix,
    refreshWorkspace,
    setSelected,
    setTreeKey,
    selectedNodeRef,
    selectedKeysRef,
    setContextMenu,
    closeRenameModal,
    closeDeleteModal,
  ]);

  /**
   * 节流的刷新函数 - 避免 Agent 连续 tool_call 导致工作空间反复刷新
   * Throttled refresh - prevent rapid workspace refreshes during agent tool calls
   */
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  const throttledRefresh = useCallback(() => {
    if (throttleTimerRef.current) {
      pendingRef.current = true; // Mark pending so trailing refresh fires after window
      return;
    }
    refreshWorkspace();
    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null;
      if (pendingRef.current) {
        pendingRef.current = false;
        refreshWorkspace(); // Fire trailing refresh for any calls missed during throttle window
      }
    }, 2000);
  }, [refreshWorkspace]);

  // Cleanup throttle timer on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    };
  }, []);

  /**
   * 监听 Agent 响应流 - 自动刷新工作空间（节流）
   * Listen to agent response stream - auto refresh workspace (throttled)
   */
  useEffect(() => {
    const isNonFileSystemTool = (name: string) => /^mcp__aionui-team-|^team_/.test(name);

    const handleResponse = (data: { type: string; data?: unknown; conversation_id?: string }) => {
      if (data.conversation_id && data.conversation_id !== conversation_id) return;

      if (data.type === 'acp_tool_call') {
        const acpData = data.data as { update?: { kind?: string; status?: string; title?: string } } | undefined;
        const kind = acpData?.update?.kind;
        const status = acpData?.update?.status;
        const title = acpData?.update?.title;
        const shouldRefresh = kind === 'edit' || kind === 'execute' || (status === 'completed' && kind !== 'read');
        if (shouldRefresh) {
          if (title && isNonFileSystemTool(title)) return;
          throttledRefresh();
        }
      }
      if (data.type === 'tool_call') {
        const toolData = data.data as { status?: string; name?: string } | undefined;
        if (toolData?.status === 'completed') {
          if (toolData.name && isNonFileSystemTool(toolData.name)) return;
          throttledRefresh();
        }
      }
    };
    const unsubscribe = ipcBridge.acpConversation.responseStream.on(handleResponse);

    return () => {
      unsubscribe();
    };
  }, [conversation_id, eventPrefix, throttledRefresh]);

  /**
   * 监听手动刷新工作空间事件
   * Listen to manual refresh workspace event
   */
  useAddEventListener(`${eventPrefix}.workspace.refresh`, () => refreshWorkspace(), [refreshWorkspace]);

  /**
   * 监听清空选中文件事件（发送消息后）
   * Listen to clear selected files event (after sending message)
   */
  useAddEventListener(`${eventPrefix}.selected.file.clear`, () => clearSelection(), [clearSelection]);

  /**
   * 监听选中文件变化事件（sendbox 中关闭标签时同步状态）(#1083)
   * Listen to selected files change event (sync state when closing tags in sendbox)
   */
  useAddEventListener(
    `${eventPrefix}.selected.file`,
    (
      items: Array<{
        path: string;
        name: string;
        isFile: boolean;
        relativePath?: string;
      }>
    ) => {
      // Extract relative paths from items, filter out files (only keep folders in tree selection)
      // 从 items 中提取相对路径，过滤掉文件（树选中状态只保留文件夹）
      const newKeys = items.filter((item) => !item.isFile && item.relativePath).map((item) => item.relativePath!);
      setSelected(newKeys);
      selectedKeysRef.current = newKeys;

      // Update selectedNodeRef based on items
      // 根据 items 更新 selectedNodeRef
      const folders = items.filter((item) => !item.isFile);
      if (folders.length > 0) {
        const lastFolder = folders[folders.length - 1];
        selectedNodeRef.current = lastFolder.relativePath
          ? {
              relativePath: lastFolder.relativePath,
              fullPath: lastFolder.path,
            }
          : null;
      } else {
        selectedNodeRef.current = null;
      }
    },
    [setSelected, selectedKeysRef, selectedNodeRef]
  );

  /**
   * 监听右键菜单外部点击 - 关闭菜单
   * Listen to clicks outside context menu - close menu
   */
  useEffect(() => {
    const handleClose = () => {
      closeContextMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeContextMenu]);
}
