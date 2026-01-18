/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import type { PreviewContentType } from '@/common/types/preview';
import { emitter } from '@/renderer/utils/emitter';
import { removeWorkspaceEntry, renameWorkspaceEntry } from '@/renderer/utils/workspaceFs';
import { useCallback } from 'react';
import type { MessageApi, RenameModalState, DeleteModalState } from '../types';
import type { FileOrFolderItem } from '@/renderer/types/files';
import { getPathSeparator, replacePathInList, updateTreeForRename } from '../utils/treeHelpers';

interface UseWorkspaceFileOpsOptions {
  workspace: string;
  eventPrefix: 'gemini' | 'acp' | 'codex';
  messageApi: MessageApi;
  t: (key: string) => string;

  // Dependencies from useWorkspaceTree
  setFiles: React.Dispatch<React.SetStateAction<IDirOrFile[]>>;
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  setExpandedKeys: React.Dispatch<React.SetStateAction<string[]>>;
  selectedKeysRef: React.MutableRefObject<string[]>;
  selectedNodeRef: React.MutableRefObject<{ relativePath: string; fullPath: string } | null>;
  ensureNodeSelected: (nodeData: IDirOrFile, options?: { emit?: boolean }) => void;
  refreshWorkspace: () => void;

  // Dependencies from useWorkspaceModals (will be created next)
  renameModal: RenameModalState;
  deleteModal: DeleteModalState;
  renameLoading: boolean;
  setRenameLoading: React.Dispatch<React.SetStateAction<boolean>>;
  closeRenameModal: () => void;
  closeDeleteModal: () => void;
  closeContextMenu: () => void;
  setRenameModal: React.Dispatch<React.SetStateAction<RenameModalState>>;
  setDeleteModal: React.Dispatch<React.SetStateAction<DeleteModalState>>;

  // Dependencies from preview context
  openPreview: (content: string, type: PreviewContentType, metadata?: any) => void;
}

/**
 * useWorkspaceFileOps - 文件操作逻辑（打开、删除、重命名、预览、添加到聊天）
 * File operations logic (open, delete, rename, preview, add to chat)
 */
export function useWorkspaceFileOps(options: UseWorkspaceFileOpsOptions) {
  const { workspace, eventPrefix, messageApi, t, setFiles, setSelected, setExpandedKeys, selectedKeysRef, selectedNodeRef, ensureNodeSelected, refreshWorkspace, renameModal, deleteModal, renameLoading, setRenameLoading, closeRenameModal, closeDeleteModal, closeContextMenu, setRenameModal, setDeleteModal, openPreview } = options;

  /**
   * 打开文件或文件夹（使用系统默认程序）
   * Open file or folder with system default handler
   */
  const handleOpenNode = useCallback(
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData) return;
      try {
        await ipcBridge.shell.openFile.invoke(nodeData.fullPath);
      } catch (error) {
        messageApi.error(t('conversation.workspace.contextMenu.openFailed') || 'Failed to open');
      }
    },
    [messageApi, t]
  );

  /**
   * 在系统文件管理器中定位文件/文件夹
   * Reveal item in system file explorer
   */
  const handleRevealNode = useCallback(
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData) return;
      try {
        await ipcBridge.shell.showItemInFolder.invoke(nodeData.fullPath);
      } catch (error) {
        messageApi.error(t('conversation.workspace.contextMenu.revealFailed') || 'Failed to reveal');
      }
    },
    [messageApi, t]
  );

  /**
   * 显示删除确认弹窗
   * Show delete confirmation modal
   */
  const handleDeleteNode = useCallback(
    (nodeData: IDirOrFile | null, options?: { emit?: boolean }) => {
      if (!nodeData || !nodeData.relativePath) return;
      ensureNodeSelected(nodeData, { emit: Boolean(options?.emit) });
      closeContextMenu();
      setDeleteModal({ visible: true, target: nodeData, loading: false });
    },
    [closeContextMenu, ensureNodeSelected, setDeleteModal]
  );

  /**
   * 确认删除操作
   * Confirm delete operation
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModal.target) return;
    try {
      setDeleteModal((prev) => ({ ...prev, loading: true }));
      const res = await removeWorkspaceEntry(deleteModal.target.fullPath);
      if (!res?.success) {
        const errorMsg = res?.msg || t('conversation.workspace.contextMenu.deleteFailed');
        messageApi.error(errorMsg);
        setDeleteModal((prev) => ({ ...prev, loading: false }));
        return;
      }

      messageApi.success(t('conversation.workspace.contextMenu.deleteSuccess'));
      setSelected([]);
      selectedKeysRef.current = [];
      selectedNodeRef.current = null;
      emitter.emit(`${eventPrefix}.selected.file`, []);
      closeDeleteModal();
      setTimeout(() => refreshWorkspace(), 200);
    } catch (error) {
      messageApi.error(t('conversation.workspace.contextMenu.deleteFailed'));
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  }, [deleteModal.target, closeDeleteModal, eventPrefix, messageApi, refreshWorkspace, t, setSelected, selectedKeysRef, selectedNodeRef, setDeleteModal]);

  /**
   * 超时包装器
   * Wrap promise with timeout guard
   */
  const waitWithTimeout = useCallback(<T>(promise: Promise<T>, timeoutMs = 8000) => {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('timeout'));
      }, timeoutMs);

      promise
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });
  }, []);

  /**
   * 确认重命名操作
   * Confirm rename operation
   */
  const handleRenameConfirm = useCallback(async () => {
    const target = renameModal.target;
    if (!target) return;
    if (renameLoading) return;
    const trimmedName = renameModal.value.trim();

    if (!trimmedName) {
      messageApi.warning(t('conversation.workspace.contextMenu.renameEmpty'));
      return;
    }

    if (trimmedName === target.name) {
      closeRenameModal();
      return;
    }

    const sep = getPathSeparator(target.fullPath);
    const parentFull = target.fullPath.slice(0, target.fullPath.lastIndexOf(sep));
    const newFullPath = parentFull ? `${parentFull}${sep}${trimmedName}` : trimmedName;

    const newRelativePath = (() => {
      if (!target.relativePath) {
        return target.isFile ? trimmedName : '';
      }
      const segments = target.relativePath.split('/');
      segments[segments.length - 1] = trimmedName;
      return segments.join('/');
    })();

    try {
      setRenameLoading(true);
      const response = await waitWithTimeout(renameWorkspaceEntry(target.fullPath, trimmedName));
      if (!response?.success) {
        const errorMsg = response?.msg || t('conversation.workspace.contextMenu.renameFailed');
        messageApi.error(errorMsg);
        return;
      }

      closeRenameModal();

      setFiles((prev) => updateTreeForRename(prev, target.relativePath ?? '', trimmedName, newFullPath));

      const oldRelativePath = target.relativePath ?? '';
      setExpandedKeys((prev) => replacePathInList(prev, oldRelativePath, newRelativePath));

      setSelected((prev) => replacePathInList(prev, oldRelativePath, newRelativePath));
      selectedKeysRef.current = replacePathInList(selectedKeysRef.current, oldRelativePath, newRelativePath);

      if (!target.isFile) {
        selectedNodeRef.current = {
          relativePath: newRelativePath,
          fullPath: newFullPath,
        };
        emitter.emit(`${eventPrefix}.selected.file`, []);
      } else {
        selectedNodeRef.current = null;
      }

      messageApi.success(t('conversation.workspace.contextMenu.renameSuccess'));
    } catch (error) {
      if (error instanceof Error && error.message === 'timeout') {
        messageApi.error(t('conversation.workspace.contextMenu.renameTimeout'));
      } else {
        messageApi.error(t('conversation.workspace.contextMenu.renameFailed'));
      }
    } finally {
      setRenameLoading(false);
    }
  }, [closeRenameModal, eventPrefix, messageApi, renameLoading, renameModal, t, waitWithTimeout, setFiles, setExpandedKeys, setSelected, selectedKeysRef, selectedNodeRef, setRenameLoading]);

  /**
   * 添加到聊天
   * Add to chat
   */
  const handleAddToChat = useCallback(
    (nodeData: IDirOrFile | null) => {
      if (!nodeData || !nodeData.fullPath) return;
      ensureNodeSelected(nodeData);
      closeContextMenu();

      const payload: FileOrFolderItem = {
        path: nodeData.fullPath,
        name: nodeData.name,
        isFile: Boolean(nodeData.isFile),
        relativePath: nodeData.relativePath || undefined,
      };

      emitter.emit(`${eventPrefix}.selected.file.append`, [payload]);
      messageApi.success(t('conversation.workspace.contextMenu.addedToChat'));
    },
    [closeContextMenu, ensureNodeSelected, eventPrefix, messageApi, t]
  );

  /**
   * 预览文件
   * Preview file
   */
  const handlePreviewFile = useCallback(
    async (nodeData: IDirOrFile | null) => {
      if (!nodeData || !nodeData.fullPath || !nodeData.isFile) return;

      try {
        closeContextMenu();

        // 根据文件扩展名确定内容类型 / Determine content type based on file extension
        const ext = nodeData.name.toLowerCase().split('.').pop() || '';

        // 支持的图片格式列表 / List of supported image formats
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'avif'];

        let contentType: PreviewContentType = 'code';
        let content = '';

        // 根据扩展名判断文件类型 / Determine file type based on extension
        if (ext === 'md' || ext === 'markdown') {
          contentType = 'markdown';
        } else if (ext === 'diff' || ext === 'patch') {
          contentType = 'diff';
        } else if (ext === 'pdf') {
          contentType = 'pdf';
        } else if (['ppt', 'pptx', 'odp'].includes(ext)) {
          contentType = 'ppt';
        } else if (['doc', 'docx', 'odt'].includes(ext)) {
          contentType = 'word';
        } else if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) {
          contentType = 'excel';
        } else if (['html', 'htm'].includes(ext)) {
          contentType = 'html';
        } else if (imageExtensions.includes(ext)) {
          contentType = 'image';
        } else if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'css', 'scss', 'json', 'xml', 'yaml', 'yml', 'txt', 'log', 'sh', 'bash', 'zsh', 'fish', 'sql', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'lua', 'vim', 'toml', 'ini', 'cfg', 'conf', 'env', 'gitignore', 'dockerignore', 'editorconfig'].includes(ext)) {
          contentType = 'code';
        } else {
          // 未知扩展名也默认为 code 类型，尝试作为文本读取 / Unknown extensions also default to code type, try to read as text
          contentType = 'code';
        }

        // 根据文件类型读取内容 / Read content based on file type
        if (contentType === 'pdf' || contentType === 'word' || contentType === 'excel' || contentType === 'ppt') {
          content = '';
        } else if (contentType === 'image') {
          // 图片: 读取为 Base64 格式 / Image: Read as Base64 format
          content = await ipcBridge.fs.getImageBase64.invoke({ path: nodeData.fullPath });
        } else {
          // 文本文件：使用 UTF-8 编码读取 / Text files: Read using UTF-8 encoding
          content = await ipcBridge.fs.readFile.invoke({ path: nodeData.fullPath });
        }

        // 打开预览面板并传入文件元数据 / Open preview panel with file metadata
        openPreview(content, contentType, {
          title: nodeData.name,
          fileName: nodeData.name,
          filePath: nodeData.fullPath,
          workspace: workspace,
          language: ext,
          // Markdown 和图片文件默认为只读模式
          // Markdown and image files default to read-only mode
          editable: contentType === 'markdown' || contentType === 'image' ? false : undefined,
        });
      } catch (error) {
        messageApi.error(t('conversation.workspace.contextMenu.previewFailed'));
      }
    },
    [closeContextMenu, openPreview, workspace, messageApi, t]
  );

  /**
   * 打开重命名弹窗
   * Open rename modal
   */
  const openRenameModal = useCallback(
    (nodeData: IDirOrFile | null) => {
      if (!nodeData) return;
      ensureNodeSelected(nodeData);
      closeContextMenu();
      setRenameModal({ visible: true, value: nodeData.name, target: nodeData });
    },
    [closeContextMenu, ensureNodeSelected, setRenameModal]
  );

  return {
    handleOpenNode,
    handleRevealNode,
    handleDeleteNode,
    handleDeleteConfirm,
    handleRenameConfirm,
    handleAddToChat,
    handlePreviewFile,
    openRenameModal,
  };
}
