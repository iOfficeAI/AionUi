import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import { Message } from '@arco-design/web-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UseTitleRenameParams = {
  title?: React.ReactNode;
  conversationId?: string;
  updateTabName: (id: string, name: string) => void;
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
export function useTitleRename({ title, conversationId, updateTabName }: UseTitleRenameParams): UseTitleRenameReturn {
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

  const canRenameTitle = typeof title === 'string' && !!conversationId;

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
      const success = await ipcBridge.conversation.update.invoke({
        id: conversationId,
        updates: { name: nextTitle },
      });

      if (success) {
        updateTabName(conversationId, nextTitle);
        emitter.emit('chat.history.refresh');
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
