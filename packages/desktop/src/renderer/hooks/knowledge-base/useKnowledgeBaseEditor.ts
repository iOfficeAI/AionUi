/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message } from '@arco-design/web-react';
import type { KnowledgeBaseItem } from '@/renderer/pages/knowledge-base/types';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UseKnowledgeBaseEditorParams = {
  activeKnowledgeBase: KnowledgeBaseItem | null;
  setActiveKnowledgeBaseId: (id: string | null) => void;
  loadKnowledgeBases: () => Promise<void>;
  setPersonalItems: React.Dispatch<React.SetStateAction<KnowledgeBaseItem[]>>;
  setSharedItems: React.Dispatch<React.SetStateAction<KnowledgeBaseItem[]>>;
  message: ReturnType<typeof Message.useMessage>[0];
};

const DEFAULT_ICON = '\u{1F4DA}';

const buildEmptyItem = (): KnowledgeBaseItem => ({
  id: '',
  name: '',
  description: '',
  icon: DEFAULT_ICON,
  isShared: false,
  source: 'user',
  documentCount: 0,
});

/**
 * Manages knowledge base editing state and handlers:
 * create, edit, save, delete.
 * The backend IPC bridge is not yet defined; CRUD operations fall back to
 * local state updates so the UI flow can be exercised end-to-end.
 */
export const useKnowledgeBaseEditor = ({
  activeKnowledgeBase,
  setActiveKnowledgeBaseId,
  loadKnowledgeBases,
  setPersonalItems,
  setSharedItems,
  message,
}: UseKnowledgeBaseEditorParams) => {
  const { t } = useTranslation();

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContext, setEditContext] = useState('');
  const [editIcon, setEditIcon] = useState(DEFAULT_ICON);
  const [editIconPreview, setEditIconPreview] = useState<string | undefined>(undefined);
  const [editAgent, setEditAgent] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [promptViewMode, setPromptViewMode] = useState<'edit' | 'preview'>('preview');

  const handleEdit = useCallback(
    (item: KnowledgeBaseItem) => {
      setIsCreating(false);
      setActiveKnowledgeBaseId(item.id);
      setEditVisible(true);
      setPromptViewMode(item.source === 'builtin' ? 'preview' : 'edit');
      setEditName(item.name || '');
      setEditDescription(item.description || '');
      setEditContext(item.description || '');
      setEditIcon(item.icon || DEFAULT_ICON);
      setEditIconPreview(undefined);
      setEditAgent(item.agentId || '');
    },
    [setActiveKnowledgeBaseId]
  );

  const handleCreate = useCallback(() => {
    setIsCreating(true);
    setActiveKnowledgeBaseId(null);
    setEditVisible(true);
    setPromptViewMode('edit');
    setEditName('');
    setEditDescription('');
    setEditContext('');
    setEditIcon(DEFAULT_ICON);
    setEditIconPreview(undefined);
    setEditAgent('');
  }, [setActiveKnowledgeBaseId]);

  const handleSave = useCallback(async () => {
    if (!editName.trim()) {
      message.error(t('settings.knowledgeBaseNameRequired', { defaultValue: 'Knowledge base name is required' }));
      return;
    }

    try {
      if (isCreating) {
        // TODO: API - 调用后端接口创建知识库
        //   const created = await ipcBridge.knowledgeBase.create.invoke({ ... });
        const newItem: KnowledgeBaseItem = {
          ...buildEmptyItem(),
          id: `kb-${Date.now()}`,
          name: editName.trim(),
          description: editDescription || undefined,
          icon: editIcon || DEFAULT_ICON,
          agentId: editAgent || undefined,
          documentCount: 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        setPersonalItems((prev) => [newItem, ...prev]);
        message.success(t('common.createSuccess', { defaultValue: 'Created successfully' }));
      } else {
        if (!activeKnowledgeBase) return;

        // TODO: API - 调用后端接口更新知识库
        //   await ipcBridge.knowledgeBase.update.invoke({ id: activeKnowledgeBase.id, ... });
        const updatedItem: KnowledgeBaseItem = {
          ...activeKnowledgeBase,
          name: editName.trim(),
          description: editDescription || undefined,
          icon: editIcon || DEFAULT_ICON,
          agentId: editAgent || undefined,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        if (activeKnowledgeBase.isShared) {
          setSharedItems((prev) => prev.map((it) => (it.id === updatedItem.id ? updatedItem : it)));
        } else {
          setPersonalItems((prev) => prev.map((it) => (it.id === updatedItem.id ? updatedItem : it)));
        }
        message.success(t('common.saveSuccess', { defaultValue: 'Saved successfully' }));
      }

      setEditVisible(false);
      await loadKnowledgeBases();
    } catch (error) {
      console.error('Failed to save knowledge base:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  }, [
    activeKnowledgeBase,
    editAgent,
    editDescription,
    editIcon,
    editName,
    isCreating,
    loadKnowledgeBases,
    message,
    setPersonalItems,
    setSharedItems,
    t,
  ]);

  const handleDeleteClick = useCallback(() => {
    if (!activeKnowledgeBase) return;
    if (activeKnowledgeBase.source === 'builtin') {
      message.warning(t('settings.cannotDeleteBuiltin', { defaultValue: 'Cannot delete builtin knowledge bases' }));
      return;
    }
    setDeleteConfirmVisible(true);
  }, [activeKnowledgeBase, message, t]);

  const handleDeleteRequest = useCallback(
    (item: KnowledgeBaseItem) => {
      setActiveKnowledgeBaseId(item.id);
      if (item.source === 'builtin') {
        message.warning(t('settings.cannotDeleteBuiltin', { defaultValue: 'Cannot delete builtin knowledge bases' }));
        return;
      }
      setDeleteConfirmVisible(true);
    },
    [message, setActiveKnowledgeBaseId, t]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!activeKnowledgeBase) return;

    try {
      // TODO: API - 调用后端接口删除知识库
      //   await ipcBridge.knowledgeBase.delete.invoke({ id: activeKnowledgeBase.id });
      if (activeKnowledgeBase.isShared) {
        setSharedItems((prev) => prev.filter((it) => it.id !== activeKnowledgeBase.id));
      } else {
        setPersonalItems((prev) => prev.filter((it) => it.id !== activeKnowledgeBase.id));
      }
      setDeleteConfirmVisible(false);
      setEditVisible(false);
      message.success(t('common.success', { defaultValue: 'Success' }));
    } catch (error) {
      console.error('Failed to delete knowledge base:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  }, [activeKnowledgeBase, message, setPersonalItems, setSharedItems, t]);

  return {
    editVisible,
    setEditVisible,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editContext,
    setEditContext,
    editIcon,
    setEditIcon,
    editIconPreview,
    setEditIconPreview,
    editAgent,
    setEditAgent,
    isCreating,
    deleteConfirmVisible,
    setDeleteConfirmVisible,
    promptViewMode,
    setPromptViewMode,
    handleEdit,
    handleCreate,
    handleSave,
    handleDeleteClick,
    handleDeleteRequest,
    handleDeleteConfirm,
  };
};
