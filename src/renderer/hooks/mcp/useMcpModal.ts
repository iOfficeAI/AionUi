import { useState, useCallback } from 'react';
import type { IMcpServer } from '@/common/storage';

/**
 * MCP模态框状态管理Hook
 * 管理所有模态框的显示/隐藏状态和相关数据
 */
export const useMcpModal = () => {
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [editingMcpServer, setEditingMcpServer] = useState<IMcpServer | undefined>();
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [mcpCollapseKey, setMcpCollapseKey] = useState<Record<string, boolean>>({});

  // 显示添加MCP服务器模态框
  const showAddMcpModal = useCallback(() => {
    setEditingMcpServer(undefined);
    setShowMcpModal(true);
  }, []);

  // 显示编辑MCP服务器模态框
  const showEditMcpModal = useCallback((server: IMcpServer) => {
    setEditingMcpServer(server);
    setShowMcpModal(true);
  }, []);

  // 隐藏MCP服务器模态框
  const hideMcpModal = useCallback(() => {
    setShowMcpModal(false);
    setEditingMcpServer(undefined);
  }, []);

  // 显示删除确认模态框
  const showDeleteConfirm = useCallback((serverId: string) => {
    setServerToDelete(serverId);
    setDeleteConfirmVisible(true);
  }, []);

  // 隐藏删除确认模态框
  const hideDeleteConfirm = useCallback(() => {
    setDeleteConfirmVisible(false);
    setServerToDelete(null);
  }, []);

  // 切换服务器折叠状态
  const toggleServerCollapse = useCallback((serverId: string) => {
    setMcpCollapseKey((prev) => ({ ...prev, [serverId]: !prev[serverId] }));
  }, []);

  return {
    // 状态
    showMcpModal,
    editingMcpServer,
    deleteConfirmVisible,
    serverToDelete,
    mcpCollapseKey,

    // 操作函数
    showAddMcpModal,
    showEditMcpModal,
    hideMcpModal,
    showDeleteConfirm,
    hideDeleteConfirm,
    toggleServerCollapse,
  };
};
