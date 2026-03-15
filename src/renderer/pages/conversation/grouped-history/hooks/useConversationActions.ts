/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { emitter } from '@/renderer/utils/emitter';
import { blockMobileInputFocus, blurActiveElement } from '@/renderer/utils/focus';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useConversationTabs } from '../../context/ConversationTabsContext';
import { isConversationPinned } from '../utils/groupingHelpers';

type UseConversationActionsParams = {
  batchMode: boolean;
  onSessionClick?: () => void;
  onBatchModeChange?: (value: boolean) => void;
  selectedConversationIds: Set<string>;
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelectedConversation: (conversation: TChatConversation) => void;
  markAsRead: (conversationId: string) => void;
};

export const useConversationActions = ({ batchMode, onSessionClick, onBatchModeChange, selectedConversationIds, setSelectedConversationIds, toggleSelectedConversation, markAsRead }: UseConversationActionsParams) => {
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameModalName, setRenameModalName] = useState<string>('');
  const [renameModalId, setRenameModalId] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [dropdownVisibleId, setDropdownVisibleId] = useState<string | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isBatchDeleteConfirm, setIsBatchDeleteConfirm] = useState(false);
  const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openTab, closeAllTabs, activeTab, updateTabName } = useConversationTabs();

  // Close dropdown when entering batch mode
  useEffect(() => {
    if (batchMode) {
      setDropdownVisibleId(null);
    }
  }, [batchMode]);

  const handleConversationClick = useCallback(
    (conversation: TChatConversation) => {
      setDropdownVisibleId(null);
      if (batchMode) {
        toggleSelectedConversation(conversation);
        return;
      }
      blockMobileInputFocus();
      blurActiveElement();

      const customWorkspace = conversation.extra?.customWorkspace;
      const newWorkspace = conversation.extra?.workspace;

      markAsRead(conversation.id);

      if (!customWorkspace) {
        closeAllTabs();
        void navigate(`/conversation/${conversation.id}`);
        if (onSessionClick) {
          onSessionClick();
        }
        return;
      }

      const currentWorkspace = activeTab?.workspace;
      if (!currentWorkspace || currentWorkspace !== newWorkspace) {
        closeAllTabs();
      }

      openTab(conversation);
      void navigate(`/conversation/${conversation.id}`);
      if (onSessionClick) {
        onSessionClick();
      }
    },
    [batchMode, toggleSelectedConversation, markAsRead, closeAllTabs, navigate, onSessionClick, activeTab, openTab]
  );

  const removeConversation = useCallback(
    async (conversationId: string) => {
      const success = await ipcBridge.conversation.remove.invoke({ id: conversationId });
      if (!success) {
        return false;
      }

      emitter.emit('conversation.deleted', conversationId);
      if (id === conversationId) {
        void navigate('/');
      }
      return true;
    },
    [id, navigate]
  );

  const handleDeleteClick = useCallback(
    (conversationId: string) => {
      setDeleteTargetId(conversationId);
      setIsBatchDeleteConfirm(false);
      setDeleteConfirmVisible(true);
    },
    []
  );

  const handleBatchDelete = useCallback(() => {
    if (selectedConversationIds.size === 0) {
      Message.warning(t('conversation.history.batchNoSelection'));
      return;
    }
    setIsBatchDeleteConfirm(true);
    setDeleteTargetId(null);
    setDeleteConfirmVisible(true);
  }, [selectedConversationIds, t]);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleteConfirmLoading(true);
    try {
      if (isBatchDeleteConfirm) {
        const selectedIds = Array.from(selectedConversationIds);
        const results = await Promise.all(selectedIds.map((conversationId) => removeConversation(conversationId)));
        const successCount = results.filter(Boolean).length;
        emitter.emit('chat.history.refresh');
        if (successCount > 0) {
          Message.success(t('conversation.history.batchDeleteSuccess', { count: successCount }));
        } else {
          Message.error(t('conversation.history.deleteFailed'));
        }
        setSelectedConversationIds(new Set());
        onBatchModeChange?.(false);
      } else if (deleteTargetId) {
        const success = await removeConversation(deleteTargetId);
        if (success) {
          emitter.emit('chat.history.refresh');
          Message.success(t('conversation.history.deleteSuccess'));
        } else {
          Message.error(t('conversation.history.deleteFailed'));
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      Message.error(t('conversation.history.deleteFailed'));
    } finally {
      setDeleteConfirmLoading(false);
      setDeleteConfirmVisible(false);
      setDeleteTargetId(null);
    }
  }, [isBatchDeleteConfirm, deleteTargetId, selectedConversationIds, removeConversation, t, setSelectedConversationIds, onBatchModeChange]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmVisible(false);
    setDeleteTargetId(null);
  }, []);

  const handleEditStart = useCallback((conversation: TChatConversation) => {
    setRenameModalId(conversation.id);
    setRenameModalName(conversation.name);
    setRenameModalVisible(true);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameModalId || !renameModalName.trim()) return;

    setRenameLoading(true);
    try {
      const success = await ipcBridge.conversation.update.invoke({
        id: renameModalId,
        updates: { name: renameModalName.trim() },
      });

      if (success) {
        updateTabName(renameModalId, renameModalName.trim());
        emitter.emit('chat.history.refresh');
        setRenameModalVisible(false);
        setRenameModalId(null);
        setRenameModalName('');
        Message.success(t('conversation.history.renameSuccess'));
      } else {
        Message.error(t('conversation.history.renameFailed'));
      }
    } catch (error) {
      console.error('Failed to update conversation name:', error);
      Message.error(t('conversation.history.renameFailed'));
    } finally {
      setRenameLoading(false);
    }
  }, [renameModalId, renameModalName, updateTabName, t]);

  const handleRenameCancel = useCallback(() => {
    setRenameModalVisible(false);
    setRenameModalId(null);
    setRenameModalName('');
  }, []);

  const handleTogglePin = useCallback(
    async (conversation: TChatConversation) => {
      const pinned = isConversationPinned(conversation);

      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conversation.id,
          updates: {
            extra: {
              pinned: !pinned,
              pinnedAt: pinned ? undefined : Date.now(),
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          mergeExtra: true,
        });

        if (success) {
          emitter.emit('chat.history.refresh');
        } else {
          Message.error(t('conversation.history.pinFailed'));
        }
      } catch (error) {
        console.error('Failed to toggle pin conversation:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [t]
  );

  const handleMenuVisibleChange = useCallback((conversationId: string, visible: boolean) => {
    setDropdownVisibleId(visible ? conversationId : null);
  }, []);

  const handleOpenMenu = useCallback((conversation: TChatConversation) => {
    setDropdownVisibleId(conversation.id);
  }, []);

  return {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    deleteConfirmVisible,
    isBatchDeleteConfirm,
    deleteConfirmLoading,
    handleConversationClick,
    handleDeleteClick,
    handleBatchDelete,
    handleDeleteConfirm,
    handleDeleteCancel,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleMenuVisibleChange,
    handleOpenMenu,
  };
};
