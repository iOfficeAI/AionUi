/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import type { ContextMenuState, RenameModalState, DeleteModalState, PasteConfirmState } from '../types';

/**
 * useWorkspaceModals - 管理所有模态框和菜单状态
 * Manage all modal and menu states
 */
export function useWorkspaceModals() {
  // Context menu state (右键菜单状态)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });

  // Rename modal state (重命名弹窗状态)
  const [renameModal, setRenameModal] = useState<RenameModalState>({
    visible: false,
    value: '',
    target: null,
  });
  const [renameLoading, setRenameLoading] = useState(false);

  // Delete confirmation modal state (删除确认弹窗状态)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    visible: false,
    target: null,
    loading: false,
  });

  // Paste confirmation modal state (粘贴确认弹窗状态)
  const [pasteConfirm, setPasteConfirm] = useState<PasteConfirmState>({
    visible: false,
    fileName: '',
    filesToPaste: [],
    doNotAsk: false,
    targetFolder: null,
  });

  /**
   * 关闭右键菜单
   * Close context menu
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => (prev.visible ? { visible: false, x: 0, y: 0, node: null } : prev));
  }, []);

  /**
   * 打开右键菜单
   * Open context menu
   */
  const openContextMenu = useCallback((x: number, y: number, node: any) => {
    setContextMenu({ visible: true, x, y, node });
  }, []);

  /**
   * 关闭重命名弹窗
   * Close rename modal
   */
  const closeRenameModal = useCallback(() => {
    setRenameModal({ visible: false, value: '', target: null });
    setRenameLoading(false);
  }, []);

  /**
   * 关闭删除确认弹窗
   * Close delete confirmation modal
   */
  const closeDeleteModal = useCallback(() => {
    setDeleteModal({ visible: false, target: null, loading: false });
  }, []);

  /**
   * 关闭粘贴确认弹窗
   * Close paste confirmation modal
   */
  const closePasteConfirm = useCallback(() => {
    setPasteConfirm({
      visible: false,
      fileName: '',
      filesToPaste: [],
      doNotAsk: false,
      targetFolder: null,
    });
  }, []);

  return {
    // Context menu
    contextMenu,
    setContextMenu,
    closeContextMenu,
    openContextMenu,

    // Rename modal
    renameModal,
    setRenameModal,
    renameLoading,
    setRenameLoading,
    closeRenameModal,

    // Delete modal
    deleteModal,
    setDeleteModal,
    closeDeleteModal,

    // Paste confirm
    pasteConfirm,
    setPasteConfirm,
    closePasteConfirm,
  };
}
