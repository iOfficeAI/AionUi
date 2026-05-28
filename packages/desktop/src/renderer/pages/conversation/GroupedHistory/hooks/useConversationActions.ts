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
import { Message, Modal } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { isConversationArchived, isConversationPinned } from '../utils/groupingHelpers';

type UseConversationActionsParams = {
  batchMode: boolean;
  conversations: TChatConversation[];
  onSessionClick?: () => void;
  onBatchModeChange?: (value: boolean) => void;
  selectedConversationIds: Set<string>;
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelectedConversation: (conversation: TChatConversation) => void;
  markAsRead: (conversation_id: string) => void;
};

export const useConversationActions = ({
  batchMode,
  conversations,
  onSessionClick,
  onBatchModeChange,
  selectedConversationIds,
  setSelectedConversationIds,
  toggleSelectedConversation,
  markAsRead,
}: UseConversationActionsParams) => {
  const conversationsById = useMemo(() => new Map(conversations.map((c) => [c.id, c])), [conversations]);
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

  const removeConversation = useCallback(
    async (conversation_id: string) => {
      const success = await ipcBridge.conversation.remove.invoke({ id: conversation_id });
      if (!success) {
        return false;
      }

      emitter.emit('conversation.deleted', conversation_id);
      if (id === conversation_id) {
        void navigate('/');
      }
      return true;
    },
    [id, navigate]
  );

  const handleDeleteClick = useCallback(
    (conversation_id: string) => {
      Modal.confirm({
        title: t('conversation.history.deleteTitle'),
        content: t('conversation.history.deleteConfirm'),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            const success = await removeConversation(conversation_id);
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

  // Per-row, remote chats archive (soft-delete in `extra.archived`) and
  // non-remote chats hard-delete. Batch mirrors that: archive remote
  // selections, delete non-remote selections. Single confirm explains both.
  const handleBatchArchive = useCallback(() => {
    if (selectedConversationIds.size === 0) {
      Message.warning(t('conversation.history.batchNoSelection'));
      return;
    }

    const selectedIds = Array.from(selectedConversationIds);
    const remoteIds: string[] = [];
    const nonRemoteIds: string[] = [];
    for (const conversationId of selectedIds) {
      const conv = conversationsById.get(conversationId);
      if (conv?.type === 'remote') {
        remoteIds.push(conversationId);
      } else {
        nonRemoteIds.push(conversationId);
      }
    }

    Modal.confirm({
      title: t('conversation.history.batchArchive'),
      content:
        nonRemoteIds.length === 0
          ? t('conversation.history.batchArchiveConfirm', { count: remoteIds.length })
          : t('conversation.history.batchArchiveMixedConfirm', {
              archive: remoteIds.length,
              delete: nonRemoteIds.length,
            }),
      okText: t('conversation.history.confirmArchive'),
      cancelText: t('conversation.history.cancelArchive'),
      okButtonProps: nonRemoteIds.length > 0 ? { status: 'warning' } : undefined,
      onOk: async () => {
        const now = Date.now();
        try {
          const [archiveResults, deleteResults] = await Promise.all([
            Promise.all(
              remoteIds.map((conversationId) =>
                ipcBridge.conversation.update.invoke({
                  id: conversationId,
                  updates: {
                    extra: {
                      archived: true,
                      archived_at: now,
                    } as Partial<TChatConversation['extra']>,
                  } as Partial<TChatConversation>,
                  merge_extra: true,
                })
              )
            ),
            Promise.all(nonRemoteIds.map((conversationId) => removeConversation(conversationId))),
          ]);
          const archivedCount = archiveResults.filter(Boolean).length;
          const deletedCount = deleteResults.filter(Boolean).length;
          emitter.emit('chat.history.refresh');
          const total = archivedCount + deletedCount;
          if (total === 0) {
            Message.error(t('conversation.history.archiveFailed'));
          } else if (deletedCount === 0) {
            Message.success(t('conversation.history.batchArchiveSuccess', { count: archivedCount }));
          } else if (archivedCount === 0) {
            Message.success(t('conversation.history.batchDeleteSuccess', { count: deletedCount }));
          } else {
            Message.success(
              t('conversation.history.batchArchiveMixedSuccess', {
                archived: archivedCount,
                deleted: deletedCount,
              })
            );
          }
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
  }, [
    conversationsById,
    onBatchModeChange,
    removeConversation,
    selectedConversationIds,
    t,
    setSelectedConversationIds,
  ]);

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
      const pinned = isConversationPinned(conversation);

      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conversation.id,
          updates: {
            extra: {
              pinned: !pinned,
              pinned_at: pinned ? undefined : Date.now(),
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          merge_extra: true,
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

  const applyArchive = useCallback(
    async (conversation: TChatConversation, nextArchived: boolean) => {
      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conversation.id,
          updates: {
            extra: {
              archived: nextArchived,
              archived_at: nextArchived ? Date.now() : undefined,
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          merge_extra: true,
        });

        if (success) {
          emitter.emit('chat.history.refresh');
          Message.success(
            t(nextArchived ? 'conversation.history.archiveSuccess' : 'conversation.history.unarchiveSuccess')
          );
        } else {
          Message.error(
            t(nextArchived ? 'conversation.history.archiveFailed' : 'conversation.history.unarchiveFailed')
          );
        }
      } catch (error) {
        console.error('Failed to toggle archive conversation:', error);
        Message.error(t(nextArchived ? 'conversation.history.archiveFailed' : 'conversation.history.unarchiveFailed'));
      }
    },
    [t]
  );

  const handleToggleArchive = useCallback(
    (conversation: TChatConversation) => {
      const archived = isConversationArchived(conversation);
      if (archived) {
        void applyArchive(conversation, false);
        return;
      }
      Modal.confirm({
        title: t('conversation.history.archiveTitle'),
        content: t('conversation.history.archiveConfirm'),
        okText: t('conversation.history.confirmArchive'),
        cancelText: t('conversation.history.cancelArchive'),
        onOk: () => applyArchive(conversation, true),
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [applyArchive, t]
  );

  const handleMenuVisibleChange = useCallback((conversation_id: string, visible: boolean) => {
    setDropdownVisibleId(visible ? conversation_id : null);
  }, []);

  const handleOpenMenu = useCallback((conversation: TChatConversation) => {
    setDropdownVisibleId(conversation.id);
  }, []);

  /**
   * Remove project state — rendered via AionModal in the GroupedHistory component.
   * Uses project's design system: AionModal component with danger-styled action button.
   */
  const [removeProjectTarget, setRemoveProjectTarget] = useState<{
    name: string;
    conversations: TChatConversation[];
  } | null>(null);
  const [removeProjectLoading, setRemoveProjectLoading] = useState(false);

  const handleRemoveProject = useCallback((projectName: string, projectConversations: TChatConversation[]) => {
    if (projectConversations.length === 0) return;
    setRemoveProjectTarget({ name: projectName, conversations: projectConversations });
  }, []);

  const handleRemoveProjectCancel = useCallback(() => {
    if (removeProjectLoading) return;
    setRemoveProjectTarget(null);
  }, [removeProjectLoading]);

  const handleRemoveProjectConfirm = useCallback(async () => {
    if (!removeProjectTarget) return;
    setRemoveProjectLoading(true);
    try {
      const results = await Promise.all(removeProjectTarget.conversations.map((c) => removeConversation(c.id)));
      const successCount = results.filter(Boolean).length;
      emitter.emit('chat.history.refresh');
      if (successCount > 0) {
        Message.success(
          t('conversation.history.batchDeleteSuccess', {
            count: successCount,
          })
        );
      } else {
        Message.error(t('conversation.history.deleteFailed'));
      }
      setRemoveProjectTarget(null);
    } catch (error) {
      console.error('Failed to remove project:', error);
      Message.error(t('conversation.history.deleteFailed'));
    } finally {
      setRemoveProjectLoading(false);
    }
  }, [removeProjectTarget, removeConversation, t]);

  return {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    handleConversationClick,
    handleDeleteClick,
    handleBatchArchive,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleToggleArchive,
    handleMenuVisibleChange,
    handleOpenMenu,
    handleRemoveProject,
    removeProjectTarget,
    removeProjectLoading,
    handleRemoveProjectCancel,
    handleRemoveProjectConfirm,
  };
};
