/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import type { EditorOpenRequest } from '@/renderer/pages/conversation/Editor/types';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useRef } from 'react';
import type { ContextMenuState, WorkspaceEventPrefix } from '../types';

interface UseWorkspaceEventsOptions {
  conversation_id: string;
  eventPrefix: WorkspaceEventPrefix;

  // Dependencies from useWorkspaceTree
  refreshWorkspace: () => void;
  clearSelection: () => void;
  setFiles: React.Dispatch<React.SetStateAction<IDirOrFile[]>>;
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  setExpandedKeys: React.Dispatch<React.SetStateAction<string[]>>;
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

  // Phase 2 (agent-editor integration): follow-mode. When the agent
  // starts reading or editing a file we want the editor to bring that
  // file into view (open + expand) so the user can see what the agent is
  // doing. The EditorContext handles the heavy lifting (dedup, dirty
  // buffer prompts, layout-mode guard); we just need to dispatch the
  // request when a `kind === 'read' | 'edit'` tool call begins.
  openEditorFile?: (request: EditorOpenRequest) => Promise<boolean>;
  expandEditor?: () => void;
  workspaceRoot?: string;
}

/**
 * useWorkspaceEvents - 管理所有事件监听器
 * Manage all event listeners
 */
export function useWorkspaceEvents(options: UseWorkspaceEventsOptions) {
  const {
    conversation_id,
    eventPrefix,
    refreshWorkspace,
    clearSelection,
    setFiles,
    setSelected,
    setExpandedKeys,
    setTreeKey,
    selectedNodeRef,
    selectedKeysRef,
    closeContextMenu,
    setContextMenu,
    closeRenameModal,
    closeDeleteModal,
    openEditorFile,
    expandEditor,
    workspaceRoot,
  } = options;

  /**
   * 监听对话切换事件 - 重置所有状态
   * Listen to conversation switch event - reset all states
   */
  useEffect(() => {
    setFiles([]);
    setSelected([]);
    setExpandedKeys([]);
    selectedNodeRef.current = null;
    selectedKeysRef.current = [];
    setTreeKey(Math.random());
    setContextMenu({ visible: false, x: 0, y: 0, node: null });
    closeRenameModal();
    closeDeleteModal();
    refreshWorkspace();
    emitter.emit(`${eventPrefix}.selected.file`, []);
  }, [
    conversation_id,
    eventPrefix,
    refreshWorkspace,
    setFiles,
    setSelected,
    setExpandedKeys,
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
   * Phase 2: extract a file path from an `acp_tool_call` update payload.
   * Mirrors the priority list used by `buildParamSummary` in
   * `common/chat/normalizeToolCall.ts` (file_path → path → locations[0].path)
   * so we follow the same convention the rest of the app uses for matching
   * tool arguments to disk files.
   */
  const extractToolCallPath = useCallback(
    (
      update: { rawInput?: Record<string, unknown>; locations?: Array<{ path?: string }> } | undefined
    ): string | null => {
      if (!update) return null;
      const raw = update.rawInput;
      if (raw) {
        const candidate = raw.file_path ?? raw.path;
        if (typeof candidate === 'string' && candidate.length > 0) return candidate;
      }
      const locPath = update.locations?.[0]?.path;
      if (typeof locPath === 'string' && locPath.length > 0) return locPath;
      return null;
    },
    []
  );

  /**
   * Phase 2 (follow mode): keep a per-file-path debounce timer so a single
   * agent run that touches the same file repeatedly (e.g. several read
   * + edit cycles) doesn't spam the editor with open requests. The window
   * is short enough that a real "switch to a different file" call still
   * fires immediately.
   */
  const followModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followModePendingRef = useRef<string | null>(null);
  const requestFollowMode = useCallback(
    (filePath: string) => {
      if (!openEditorFile) return;
      if (typeof filePath !== 'string' || filePath.length === 0) return;
      // If the same file was just requested, debounce a trailing fire.
      if (followModePendingRef.current === filePath && followModeTimerRef.current) {
        return;
      }
      followModePendingRef.current = filePath;
      if (followModeTimerRef.current) {
        clearTimeout(followModeTimerRef.current);
      }
      followModeTimerRef.current = setTimeout(() => {
        followModeTimerRef.current = null;
        const pending = followModePendingRef.current;
        followModePendingRef.current = null;
        if (!pending) return;
        // Bring the editor to the foreground so the user can see what
        // the agent is doing. `openEditorFile` is idempotent and
        // short-circuits if the file is already open in any group.
        expandEditor?.();
        void openEditorFile({ path: pending, workspace: workspaceRoot });
      }, 80);
    },
    [openEditorFile, expandEditor, workspaceRoot]
  );

  // Cleanup follow-mode timer on unmount.
  useEffect(() => {
    return () => {
      if (followModeTimerRef.current) {
        clearTimeout(followModeTimerRef.current);
        followModeTimerRef.current = null;
      }
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
        const acpData = data.data as
          | {
              update?: {
                kind?: string;
                status?: string;
                title?: string;
                rawInput?: Record<string, unknown>;
                locations?: Array<{ path?: string }>;
              };
            }
          | undefined;
        const update = acpData?.update;
        const kind = update?.kind;
        const status = update?.status;
        const title = update?.title;
        const shouldRefresh = kind === 'edit' || kind === 'execute' || (status === 'completed' && kind !== 'read');
        if (shouldRefresh) {
          if (title && isNonFileSystemTool(title)) return;
          throttledRefresh();
        }
        // Phase 2 (follow mode): on the FIRST update of a read or edit
        // tool call, bring the file into the editor. We gate on
        // `status === 'pending' | 'in_progress'` (the leading edge) so
        // the editor lights up as soon as the agent announces the call,
        // not only after the call finishes. `pending` fires for queued
        // calls; `in_progress` fires for live ones. We deliberately skip
        // `completed` and `failed` to avoid reopening after the user
        // already moved on.
        if ((kind === 'read' || kind === 'edit') && (status === 'pending' || status === 'in_progress')) {
          const filePath = extractToolCallPath(update);
          if (filePath) requestFollowMode(filePath);
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
  }, [conversation_id, eventPrefix, throttledRefresh, extractToolCallPath, requestFollowMode]);

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
   * 监听搜索工作空间响应
   * Listen to search workspace response
   */
  useEffect(() => {
    return ipcBridge.conversation.responseSearchWorkSpace.provider((data) => {
      if (data.match) setFiles([data.match]);
      return Promise.resolve();
    });
  }, [setFiles]);

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
