/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type KnowledgeBaseTab = 'personal' | 'shared';

// TODO: API - 对接后端接口后完善 KnowledgeBaseItem 类型
export type KnowledgeBaseItem = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  owner?: string;
  isShared: boolean;
  documentCount?: number;
  createdAt?: string;
  updatedAt?: string;
  /** Marks knowledge bases that come pre-bundled with the product. */
  source?: 'builtin' | 'user';
  /** Agent/runtime engine powering the knowledge base. */
  agentId?: string;
};

export type KnowledgeBaseListItem = KnowledgeBaseItem;

export type BuiltinIconOption = {
  id: string;
  label: string;
  src: string;
};

export type AvailableBackend = {
  id: string;
  name: string;
  runtimeKey: string;
  isExtension?: boolean;
  icon?: string;
  customAgentId?: string;
  modelOptions: Array<{ value: string; label: string; description?: string }>;
};

export type KnowledgeBaseEditorViewModel = {
  isCreating: boolean;
  profile: {
    name: string;
    setName: (value: string) => void;
    description: string;
    setDescription: (value: string) => void;
    icon: string;
    setIcon: (value: string) => void;
    setIconPreview: (value: string | undefined) => void;
    iconImage?: string;
    builtinIconOptions: BuiltinIconOption[];
  };
  agent: {
    value: string;
    setValue: (value: string) => void;
    availableBackends: AvailableBackend[];
  };
  rules: {
    content: string;
    setContent: (value: string) => void;
    viewMode: 'edit' | 'preview';
    setViewMode: (value: 'edit' | 'preview') => void;
  };
  actions: {
    save: () => void;
    requestDelete: () => void;
  };
};
