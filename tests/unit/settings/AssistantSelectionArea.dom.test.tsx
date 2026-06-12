/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, Message } from '@arco-design/web-react';
import AssistantSelectionArea from '@/renderer/pages/guid/components/AssistantSelectionArea';

const mockNavigate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('swr', () => ({
  default: () => ({ data: null }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      get: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: vi.fn(() => null),
}));

vi.mock('@/renderer/hooks/assistant', () => ({
  useAssistantList: () => ({
    activeAssistantId: null,
    setActiveAssistantId: vi.fn(),
    activeAssistant: null,
    loadAssistants: vi.fn(),
  }),
  useDetectedAgents: () => ({
    availableBackends: [],
    refreshAgentDetection: vi.fn(),
  }),
  useAssistantEditor: () => ({
    editVisible: false,
    setEditVisible: vi.fn(),
    isCreating: false,
    editName: '',
    setEditName: vi.fn(),
    editDescription: '',
    setEditDescription: vi.fn(),
    editAvatar: '',
    setEditAvatar: vi.fn(),
    editAgent: 'claude',
    setEditAgent: vi.fn(),
    editRecommendedPromptsText: '',
    setEditRecommendedPromptsText: vi.fn(),
    defaultModelMode: 'auto',
    setDefaultModelMode: vi.fn(),
    defaultModelValue: '',
    setDefaultModelValue: vi.fn(),
    defaultPermissionMode: 'auto',
    setDefaultPermissionMode: vi.fn(),
    defaultPermissionValue: '',
    setDefaultPermissionValue: vi.fn(),
    defaultSkillsMode: 'auto',
    setDefaultSkillsMode: vi.fn(),
    defaultMcpMode: 'auto',
    setDefaultMcpMode: vi.fn(),
    availableMcpServers: [],
    selectedMcpIds: [],
    setSelectedMcpIds: vi.fn(),
    editContext: '',
    setEditContext: vi.fn(),
    promptViewMode: 'preview',
    setPromptViewMode: vi.fn(),
    availableSkills: [],
    selectedSkills: [],
    setSelectedSkills: vi.fn(),
    pendingSkills: [],
    customSkills: [],
    setDeletePendingSkillName: vi.fn(),
    setDeleteCustomSkillName: vi.fn(),
    builtinAutoSkills: [],
    disabledBuiltinSkills: [],
    setDisabledBuiltinSkills: vi.fn(),
    deleteConfirmVisible: false,
    setDeleteConfirmVisible: vi.fn(),
    setPendingSkills: vi.fn(),
    setCustomSkills: vi.fn(),
    handleSave: vi.fn(),
    handleDeleteClick: vi.fn(),
    handleDeleteConfirm: vi.fn(),
    handleDuplicate: vi.fn(),
    deletePendingSkillName: null,
    deleteCustomSkillName: null,
  }),
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/DeleteAssistantModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/SkillConfirmModals', () => ({
  default: () => null,
}));

describe('AssistantSelectionArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('registers an open-details callback that navigates to the assistant settings editor page', () => {
    let openDetails: (() => void) | null = null;

    render(
      <ConfigProvider>
        <AssistantSelectionArea
          is_presetAgent={true}
          selectedAgentKey='custom:cowork'
          selectedAgentInfo={{
            agent_type: 'acp',
            name: 'Cowork',
            custom_agent_id: 'cowork',
          }}
          assistants={[
            {
              id: 'cowork',
              source: 'builtin',
              name: 'Cowork',
              name_i18n: {},
              description_i18n: {},
              enabled: true,
              sort_order: 1,
              preset_agent_type: 'claude',
              enabled_skills: [],
              custom_skill_names: [],
              disabled_builtin_skills: [],
              context_i18n: {},
              prompts: [],
              prompts_i18n: {},
              models: [],
            },
          ]}
          localeKey='en-US'
          currentEffectiveAgentInfo={{
            agent_type: 'acp',
            isFallback: false,
            originalType: 'acp',
            isAvailable: true,
          }}
          onSelectAssistant={vi.fn()}
          onSetInput={vi.fn()}
          onFocusInput={vi.fn()}
          onRegisterOpenDetails={(callback) => {
            openDetails = callback;
          }}
        />
      </ConfigProvider>
    );

    expect(openDetails).toBeTypeOf('function');

    openDetails?.();

    expect(mockNavigate).toHaveBeenCalledWith('/settings/assistants', {
      state: {
        openAssistantId: 'cowork',
        openAssistantEditor: true,
      },
    });
    expect(sessionStorage.getItem('guid.openAssistantEditorIntent')).toBe(
      JSON.stringify({
        assistantId: 'cowork',
        openAssistantEditor: true,
      })
    );
  });

  it('renders homepage assistant cards in backend order without pinning builtin presets', () => {
    render(
      <ConfigProvider>
        <AssistantSelectionArea
          is_presetAgent={false}
          selectedAgentInfo={undefined}
          assistants={[
            {
              id: 'writer',
              source: 'user',
              name: 'Writer',
              name_i18n: {},
              description_i18n: {},
              enabled: true,
              sort_order: 1000,
              preset_agent_type: 'claude',
              enabled_skills: [],
              custom_skill_names: [],
              disabled_builtin_skills: [],
              context_i18n: {},
              prompts: [],
              prompts_i18n: {},
              models: [],
            },
            {
              id: 'cowork',
              source: 'builtin',
              name: 'Cowork',
              name_i18n: {},
              description_i18n: {},
              enabled: true,
              sort_order: 2000,
              preset_agent_type: 'claude',
              enabled_skills: [],
              custom_skill_names: [],
              disabled_builtin_skills: [],
              context_i18n: {},
              prompts: [],
              prompts_i18n: {},
              models: [],
            },
          ]}
          localeKey='en-US'
          currentEffectiveAgentInfo={{
            agent_type: 'acp',
            isFallback: false,
            originalType: 'acp',
            isAvailable: true,
          }}
          onSelectAssistant={vi.fn()}
          onSetInput={vi.fn()}
          onFocusInput={vi.fn()}
        />
      </ConfigProvider>
    );

    const presetCards = screen
      .getAllByTestId(/preset-pill-/)
      .map((element) => element.getAttribute('data-testid')?.replace('preset-pill-', ''));

    expect(presetCards).toEqual(['writer', 'cowork']);
  });

  it('prefers localized recommended prompts from assistant detail in selected assistant view', () => {
    render(
      <ConfigProvider>
        <AssistantSelectionArea
          is_presetAgent={true}
          selectedAgentKey='custom:academic-paper'
          selectedAgentInfo={{
            agent_type: 'acp',
            name: 'Academic Paper',
            custom_agent_id: 'academic-paper',
          }}
          assistants={[
            {
              id: 'academic-paper',
              source: 'builtin',
              name: 'Academic Paper',
              name_i18n: {},
              description_i18n: {},
              enabled: true,
              sort_order: 1,
              preset_agent_type: 'claude',
              enabled_skills: [],
              custom_skill_names: [],
              disabled_builtin_skills: [],
              context_i18n: {},
              prompts: ['English prompt'],
              prompts_i18n: {
                'zh-CN': ['中文提示词'],
              },
              models: [],
            },
          ]}
          selectedAssistantDetail={{
            id: 'academic-paper',
            source: 'builtin',
            profile: {
              name: 'Academic Paper',
              name_i18n: {},
              description_i18n: {},
            },
            state: {
              enabled: true,
              sort_order: 1,
            },
            engine: {
              agent_backend: 'claude',
            },
            rules: {
              content: '',
              storage_mode: 'builtin_asset',
            },
            prompts: {
              recommended: ['English prompt'],
              recommended_i18n: {
                'zh-CN': ['中文提示词'],
              },
            },
            defaults: {
              model: { mode: 'auto' },
              permission: { mode: 'auto' },
              skills: { mode: 'auto', value: [] },
              mcps: { mode: 'auto', value: [] },
            },
            capabilities: {
              default_skill_ids: [],
              custom_skill_names: [],
              default_disabled_builtin_skill_ids: [],
            },
            preferences: {
              last_skill_ids: [],
              last_disabled_builtin_skill_ids: [],
              last_mcp_ids: [],
            },
          }}
          localeKey='zh-CN'
          currentEffectiveAgentInfo={{
            agent_type: 'acp',
            isFallback: false,
            originalType: 'acp',
            isAvailable: true,
          }}
          onSelectAssistant={vi.fn()}
          onSetInput={vi.fn()}
          onFocusInput={vi.fn()}
        />
      </ConfigProvider>
    );

    expect(screen.getByText('中文提示词')).toBeInTheDocument();
    expect(screen.queryByText('English prompt')).not.toBeInTheDocument();
  });
});
