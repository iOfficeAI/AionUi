/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { emitter } from '@/renderer/utils/emitter';
import { blockMobileInputFocus, blurActiveElement } from '@/renderer/utils/ui/focus';
import { Input, Message, Modal } from '@arco-design/web-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useConversationTabs } from '../../hooks/ConversationTabsContext';
import { isConversationPinned } from '../utils/groupingHelpers';
import { useConversationGroups } from './useConversationGroups';

type UseConversationActionsParams = {
  batchMode: boolean;
  onSessionClick?: () => void;
  onBatchModeChange?: (value: boolean) => void;
  selectedConversationIds: Set<string>;
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelectedConversation: (conversation: TChatConversation) => void;
  markAsRead: (conversationId: string) => void;
};

export const useConversationActions = ({
  batchMode,
  onSessionClick,
  onBatchModeChange,
  selectedConversationIds,
  setSelectedConversationIds,
  toggleSelectedConversation,
  markAsRead,
}: UseConversationActionsParams) => {
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameModalName, setRenameModalName] = useState<string>('');
  const [renameModalId, setRenameModalId] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [dropdownVisibleId, setDropdownVisibleId] = useState<string | null>(null);
  const [newGroupModalVisible, setNewGroupModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const pendingGroupConversationRef = useRef<TChatConversation | null>(null);
  const { groups, createGroup, deleteGroup, renameGroup, moveToGroup } = useConversationGroups();
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
      Modal.confirm({
        title: t('conversation.history.deleteTitle'),
        content: t('conversation.history.deleteConfirm'),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            const success = await removeConversation(conversationId);
            if (success) {
              emitter.emit('chat.history.refresh');
              Message.success(t('conversation.history.deleteSuccess'));
            } else {
              Message.error(t('conversation.history.deleteFailed'));
            }
          } catch (error) {
            console.error('Failed to remove conversation:', error);
            Message.error(t('conversation.history.deleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [removeConversation, t]
  );

  const handleBatchDelete = useCallback(() => {
    if (selectedConversationIds.size === 0) {
      Message.warning(t('conversation.history.batchNoSelection'));
      return;
    }

    Modal.confirm({
      title: t('conversation.history.batchDelete'),
      content: t('conversation.history.batchDeleteConfirm', { count: selectedConversationIds.size }),
      okText: t('conversation.history.confirmDelete'),
      cancelText: t('conversation.history.cancelDelete'),
      okButtonProps: { status: 'warning' },
      onOk: async () => {
        const selectedIds = Array.from(selectedConversationIds);
        try {
          const results = await Promise.all(selectedIds.map((conversationId) => removeConversation(conversationId)));
          const successCount = results.filter(Boolean).length;
          emitter.emit('chat.history.refresh');
          if (successCount > 0) {
            Message.success(t('conversation.history.batchDeleteSuccess', { count: successCount }));
          } else {
            Message.error(t('conversation.history.deleteFailed'));
          }
        } catch (error) {
          console.error('Failed to batch delete conversations:', error);
          Message.error(t('conversation.history.deleteFailed'));
        } finally {
          setSelectedConversationIds(new Set());
          onBatchModeChange?.(false);
        }
      },
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [onBatchModeChange, removeConversation, selectedConversationIds, t, setSelectedConversationIds]);

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
        await refreshConversationCache(renameModalId);
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

  const handleMoveToGroup = useCallback(
    async (conversation: TChatConversation, groupName: string | null) => {
      setDropdownVisibleId(null);
      await moveToGroup(conversation, groupName);
    },
    [moveToGroup]
  );

  const handleCreateAndMoveToGroup = useCallback((conversation: TChatConversation) => {
    setDropdownVisibleId(null);
    pendingGroupConversationRef.current = conversation;
    setNewGroupName('');
    setNewGroupModalVisible(true);
  }, []);

  const handleNewGroupConfirm = useCallback(async () => {
    const conversation = pendingGroupConversationRef.current;
    const trimmed = newGroupName.trim();
    if (!conversation || !trimmed) {
      setNewGroupModalVisible(false);
      return;
    }

    const newGroup = createGroup(trimmed);
    if (newGroup) {
      await moveToGroup(conversation, trimmed);
    }
    setNewGroupModalVisible(false);
    setNewGroupName('');
    pendingGroupConversationRef.current = null;
  }, [newGroupName, createGroup, moveToGroup]);

  const handleNewGroupCancel = useCallback(() => {
    setNewGroupModalVisible(false);
    setNewGroupName('');
    pendingGroupConversationRef.current = null;
  }, []);

  return {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    newGroupModalVisible,
    newGroupName,
    setNewGroupName,
    groups,
    handleConversationClick,
    handleDeleteClick,
    handleBatchDelete,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleMoveToGroup,
    handleCreateAndMoveToGroup,
    handleNewGroupConfirm,
    handleNewGroupCancel,
    handleMenuVisibleChange,
    handleOpenMenu,
  };
};
