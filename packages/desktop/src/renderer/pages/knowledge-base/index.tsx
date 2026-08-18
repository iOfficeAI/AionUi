/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from '@arco-design/web-react';
import { useKnowledgeBaseEditor, useKnowledgeBaseList } from '@/renderer/hooks/knowledge-base';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useManagedAgentRuntimeCatalog } from '@/renderer/hooks/agent/useManagedAgents';
import { buildAssistantEditorBackends } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import { resolveIconImageSrc } from './knowledgeBaseUtils';
import KnowledgeBaseEditorPage from './KnowledgeBaseEditorPage';
import KnowledgeBaseHomeTabs from './KnowledgeBaseHomeTabs';
import DeleteKnowledgeBaseModal from './DeleteKnowledgeBaseModal';
import type { KnowledgeBaseEditorViewModel, KnowledgeBaseItem, KnowledgeBaseTab } from './types';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const KnowledgeBasePage: React.FC = () => {
  const [message, messageContext] = Message.useMessage({ maxCount: 10 });
  const navigate = useNavigate();
  const { user } = useAuth();
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = user?.token ?? null;
  }, [user?.token]);

  const {
    personalItems,
    setPersonalItems,
    sharedItems,
    setSharedItems,
    personalLoading,
    personalError,
    sharedLoading,
    sharedError,
    activeKnowledgeBaseId,
    setActiveKnowledgeBaseId,
    activeKnowledgeBase,
    loadKnowledgeBases,
    loadPersonalKnowledgeBases,
    loadSharedKnowledgeBases,
  } = useKnowledgeBaseList();

  const handleTabRefresh = useCallback(
    (next: KnowledgeBaseTab) => {
      const token = tokenRef.current;
      if (!token) return;
      if (next === 'personal') void loadPersonalKnowledgeBases(token);
      else void loadSharedKnowledgeBases(token);
    },
    [loadPersonalKnowledgeBases, loadSharedKnowledgeBases]
  );

  const handleRetryLoadPersonal = useCallback(() => {
    const token = tokenRef.current;
    if (!token) return;
    void loadPersonalKnowledgeBases(token);
  }, [loadPersonalKnowledgeBases]);

  const editor = useKnowledgeBaseEditor({
    activeKnowledgeBase,
    setActiveKnowledgeBaseId,
    loadKnowledgeBases,
    setPersonalItems,
    setSharedItems,
    message,
  });

  const managedAgentRuntimeCatalog = useManagedAgentRuntimeCatalog();
  const builtinIconOptions = useMemo(() => {
    const builtin = [...personalItems, ...sharedItems].filter(
      (item) => item.icon && item.icon.startsWith('/api/knowledge-base/')
    );
    return builtin
      .map((item) => {
        const src = resolveIconImageSrc(item.icon);
        if (!src) return null;
        return { id: item.id, label: item.name, src };
      })
      .filter((option): option is NonNullable<typeof option> => option !== null);
  }, [personalItems, sharedItems]);

  const availableBackends = useMemo(
    () => buildAssistantEditorBackends(managedAgentRuntimeCatalog, 'en-US', editor.editAgent),
    [editor.editAgent, managedAgentRuntimeCatalog]
  );

  const editIconImage = editor.editIconPreview || resolveIconImageSrc(editor.editIcon);
  const showEditor = editor.editVisible && (editor.isCreating || activeKnowledgeBaseId !== null);

  const editorViewModel: KnowledgeBaseEditorViewModel = {
    isCreating: editor.isCreating,
    profile: {
      name: editor.editName,
      setName: editor.setEditName,
      description: editor.editDescription,
      setDescription: editor.setEditDescription,
      icon: editor.editIcon,
      setIcon: editor.setEditIcon,
      setIconPreview: editor.setEditIconPreview,
      iconImage: editIconImage,
      builtinIconOptions,
    },
    agent: {
      value: editor.editAgent,
      setValue: editor.setEditAgent,
      availableBackends,
    },
    rules: {
      content: editor.editContext,
      setContent: editor.setEditContext,
      viewMode: editor.promptViewMode,
      setViewMode: editor.setPromptViewMode,
    },
    actions: {
      save: editor.handleSave,
      requestDelete: editor.handleDeleteClick,
    },
  };

  const handleOpen = useCallback(
    (item: KnowledgeBaseItem) => {
      // TODO: API - 打开知识库详情页面（暂时仅打开编辑）
      void editor.handleEdit(item);
    },
    [editor]
  );

  // TODO: API - 知识库直接打开对话：根据 KB 的 agentId 跳转到 /guid
  const handleStartChat = useCallback(
    (item: KnowledgeBaseItem) => {
      navigate(`/kb-chat/${encodeURIComponent(item.id)}`, {
        state: { kbName: item.name },
      });
    },
    [navigate]
  );

  return (
    <div className='h-full w-full overflow-hidden bg-bg-0'>
      <div className='flex flex-col h-full w-full'>
        {messageContext}
        <div className='flex-1 min-h-0'>
          {showEditor ? (
            <KnowledgeBaseEditorPage
              editor={editorViewModel}
              activeKnowledgeBase={activeKnowledgeBase}
              onBack={() => editor.setEditVisible(false)}
            />
          ) : (
            <KnowledgeBaseHomeTabs
              personalItems={personalItems}
              sharedItems={sharedItems}
              personalLoading={personalLoading}
              personalError={personalError}
              sharedLoading={sharedLoading}
              sharedError={sharedError}
              onRetryLoadPersonal={handleRetryLoadPersonal}
              onRetryLoadShared={() => void loadKnowledgeBases()}
              onRefresh={handleTabRefresh}
              onEdit={(item) => void editor.handleEdit(item)}
              onDelete={(item) => editor.handleDeleteRequest(item)}
              onOpen={handleOpen}
              onCreate={() => void editor.handleCreate()}
              onStartChat={handleStartChat}
            />
          )}

          <DeleteKnowledgeBaseModal
            visible={editor.deleteConfirmVisible}
            onCancel={() => editor.setDeleteConfirmVisible(false)}
            onConfirm={() => void editor.handleDeleteConfirm()}
            activeKnowledgeBase={activeKnowledgeBase}
          />
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBasePage;
