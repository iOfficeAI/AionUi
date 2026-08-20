/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { SidebarItem } from '@/common/types/sidebar';
import { requestConversationSendBoxPrefill } from '@/renderer/hooks/chat/useSendBoxDraft';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { emitter } from '@/renderer/utils/emitter';
import { blockMobileInputFocus, blurActiveElement } from '@/renderer/utils/ui/focus';
import { Message, Modal } from '@arco-design/web-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { isConversationPinned } from '../utils/groupingHelpers';

type UseConversationActionsParams = {
  batchMode: boolean;
  onSessionClick?: () => void;
  onBatchModeChange?: (value: boolean) => void;
  selectedConversationIds: Set<string>;
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelectedConversation: (conversation: TChatConversation) => void;
  markAsRead: (conversation_id: string) => void;
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
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

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

      markAsRead(conversation.id);

      void navigate(`/conversation/${conversation.id}`);
      if (onSessionClick) {
        onSessionClick();
      }
    },
    [batchMode, toggleSelectedConversation, markAsRead, navigate, onSessionClick]
  );

  const handleBatchArchive = useCallback(() => {
    if (selectedConversationIds.size === 0) {
      Message.warning(t('conversation.history.batchNoSelection'));
      return;
    }

    Modal.confirm({
      title: t('conversation.history.batchArchive'),
      content: t('conversation.history.batchArchiveConfirm', { count: selectedConversationIds.size }),
      okText: t('conversation.history.batchArchive'),
      cancelText: t('conversation.history.cancelDelete'),
      okButtonProps: { status: 'warning' },
      onOk: async () => {
        const selectedIds = Array.from(selectedConversationIds);
        try {
          await Promise.all(
            selectedIds.map((conversation_id) =>
              ipcBridge.sidebar.archive.invoke({ item_type: 'conversation', item_id: conversation_id })
            )
          );
          emitter.emit('chat.history.refresh');
          if (id && selectedConversationIds.has(id)) {
            void navigate('/');
          }
          Message.success(t('conversation.history.batchArchiveSuccess', { count: selectedIds.length }));
        } catch (error) {
          console.error('Failed to batch archive conversations:', error);
          Message.error(t('conversation.history.archiveFailed'));
        } finally {
          setSelectedConversationIds(new Set());
          onBatchModeChange?.(false);
        }
      },
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [id, navigate, onBatchModeChange, selectedConversationIds, t, setSelectedConversationIds]);

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
  }, [renameModalId, renameModalName, t]);

  const handleRenameCancel = useCallback(() => {
    setRenameModalVisible(false);
    setRenameModalId(null);
    setRenameModalName('');
  }, []);

  const handleTogglePin = useCallback(
    async (conversation: TChatConversation) => {
      // Pin truth lives in the backend `user_order` table (a row's existence),
      // not `extra.pinned`. Toggling = insert/delete that row; both calls are
      // idempotent and take no body. The sidebar refresh re-reads the derived
      // `pinned` flag and re-groups server-side.
      const pinned = isConversationPinned(conversation);

      try {
        if (pinned) {
          await ipcBridge.order.pinned.delete.invoke({ item_type: 'conversation', item_id: conversation.id });
        } else {
          await ipcBridge.order.pinned.put.invoke({ item_type: 'conversation', item_id: conversation.id });
        }
        emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error('Failed to toggle pin conversation:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [t]
  );

  const handleArchive = useCallback(
    async (conversation: TChatConversation) => {
      // Archiving moves the conversation into the archived slice (backend also
      // unpins it, D6). The non-`?archived` sidebar read no longer returns it,
      // so the refresh makes the row drop out of the active list on its own.
      setDropdownVisibleId(null);
      try {
        await ipcBridge.sidebar.archive.invoke({ item_type: 'conversation', item_id: conversation.id });
        emitter.emit('chat.history.refresh');
        Message.success(t('conversation.history.archiveSuccess'));
      } catch (error) {
        console.error('Failed to archive conversation:', error);
        Message.error(t('conversation.history.archiveFailed'));
      }
    },
    [t]
  );

  const handleMenuVisibleChange = useCallback((conversation_id: string, visible: boolean) => {
    setDropdownVisibleId(visible ? conversation_id : null);
  }, []);

  const handleOpenMenu = useCallback((conversation: TChatConversation) => {
    setDropdownVisibleId(conversation.id);
  }, []);

  const handleCreateCronTask = useCallback(
    (conversation: TChatConversation) => {
      const prefillPrompt = t('cron.status.defaultPrompt');
      setDropdownVisibleId(null);

      if (isLegacyReadOnlyConversationType(conversation.type)) {
        void navigate('/guid', {
          state: {
            prefillPrompt,
            preservePrefillDraft: true,
            focusPrefill: true,
          },
        });
      } else {
        requestConversationSendBoxPrefill(conversation.id, prefillPrompt);
        if (id !== conversation.id) {
          void navigate(`/conversation/${conversation.id}`);
        }
      }

      onSessionClick?.();
    },
    [id, navigate, onSessionClick, t]
  );

  const handleArchiveProject = useCallback(
    (projectName: string, items: SidebarItem[], projectId?: string) => {
      // Archiving is the sidebar's non-destructive "remove" — the whole project's
      // units move into the archived slice (hard delete now lives on the archive
      // page). A real project archives in one server-side sweep keyed by
      // `project_id` (catches path-merged units the window may not show); a dir
      // pseudo-group has no backing project, so it archives each visible unit.
      Modal.confirm({
        title: t('conversation.history.archiveProjectConfirmTitle'),
        content: t('conversation.history.archiveProjectConfirmContent', { name: projectName }),
        okText: t('conversation.history.archive'),
        cancelText: t('conversation.history.cancelDelete'),
        onOk: async () => {
          try {
            if (projectId) {
              await ipcBridge.sidebar.archiveProject.invoke({ project_id: projectId });
            } else {
              await Promise.all(
                items.map((item) =>
                  item.type === 'team'
                    ? ipcBridge.sidebar.archive.invoke({ item_type: 'team', item_id: item.team_id })
                    : ipcBridge.sidebar.archive.invoke({ item_type: 'conversation', item_id: item.conversation.id })
                )
              );
            }
            emitter.emit('chat.history.refresh');
            Message.success(t('conversation.history.archiveProjectSuccess'));
          } catch (error) {
            console.error('Failed to archive project:', error);
            Message.error(t('conversation.history.archiveProjectFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [t]
  );

  return {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    handleConversationClick,
    handleBatchArchive,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleArchive,
    handleMenuVisibleChange,
    handleOpenMenu,
    handleCreateCronTask,
    handleArchiveProject,
  };
};
