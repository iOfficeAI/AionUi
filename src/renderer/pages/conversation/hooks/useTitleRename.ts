import { ipcBridge } from '@/common';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { emitter } from '@/renderer/utils/emitter';
import { Message } from '@arco-design/web-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UseTitleRenameParams = {
  title?: React.ReactNode;
  conversationId?: string;
  updateTabName: (id: string, name: string) => void;
  /** When provided, replaces the default conversation.update call. Return true on success. */
  onRename?: (newName: string) => Promise<boolean>;
};

type UseTitleRenameReturn = {
  editingTitle: boolean;
  setEditingTitle: React.Dispatch<React.SetStateAction<boolean>>;
  titleDraft: string;
  setTitleDraft: React.Dispatch<React.SetStateAction<string>>;
  renameLoading: boolean;
  canRenameTitle: boolean;
  submitTitleRename: () => Promise<void>;
};

/**
 * Manages inline title editing state and submission for conversation rename.
 */
export function useTitleRename({
  title,
  conversationId,
  updateTabName,
  onRename,
}: UseTitleRenameParams): UseTitleRenameReturn {
  const { t } = useTranslation();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(typeof title === 'string' ? title : '');
  const [renameLoading, setRenameLoading] = useState(false);

  // Sync title draft when props.title changes
  useEffect(() => {
    if (typeof title === 'string') {
      setTitleDraft(title);
    }
  }, [title]);

  const canRenameTitle = typeof title === 'string' && (!!conversationId || !!onRename);

  const submitTitleRename = async () => {
    if (!canRenameTitle) return;
    const nextTitle = titleDraft.trim();
    const currentTitle = typeof title === 'string' ? title.trim() : '';

    if (!nextTitle) {
      setTitleDraft(currentTitle);
      setEditingTitle(false);
      return;
    }

    if (nextTitle === currentTitle) {
      setEditingTitle(false);
      return;
    }

    setRenameLoading(true);
    try {
      let success: boolean;
      if (onRename) {
        success = await onRename(nextTitle);
      } else {
        const result = await ipcBridge.conversation.update.invoke({
          id: conversationId!,
          updates: { name: nextTitle },
        });
        success = Boolean(result);
        if (success) {
          await refreshConversationCache(conversationId!);
          updateTabName(conversationId!, nextTitle);
          emitter.emit('chat.history.refresh');
        }
      }

      if (success) {
        setEditingTitle(false);
        Message.success(t('conversation.history.renameSuccess'));
      } else {
        Message.error(t('conversation.history.renameFailed'));
      }
    } catch (error) {
      console.error('Failed to update conversation title:', error);
      Message.error(t('conversation.history.renameFailed'));
    } finally {
      setRenameLoading(false);
    }
  };

  return {
    editingTitle,
    setEditingTitle,
    titleDraft,
    setTitleDraft,
    renameLoading,
    canRenameTitle,
    submitTitleRename,
  };
}
