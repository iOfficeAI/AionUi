/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import AssistantEditorPage from '@/renderer/pages/settings/AssistantSettings/AssistantEditorPage';
import type { AssistantEditorViewModel } from '@/renderer/pages/settings/AssistantSettings/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/AssistantEditorSections', () => ({
  default: () => <div data-testid='assistant-editor-sections' />,
}));

describe('AssistantEditorPage', () => {
  const createEditor = (): AssistantEditorViewModel => ({
    isCreating: true,
    profile: {
      name: '',
      setName: vi.fn(),
      description: '',
      setDescription: vi.fn(),
      avatar: '🤖',
      setAvatar: vi.fn(),
      setAvatarPreview: vi.fn(),
    },
    agent: {
      value: 'claude',
      setValue: vi.fn(),
      availableBackends: [],
    },
    prompts: {
      text: '',
      setText: vi.fn(),
    },
    defaults: {
      model: { mode: 'auto', setMode: vi.fn(), value: '', setValue: vi.fn() },
      permission: { mode: 'auto', setMode: vi.fn(), value: '', setValue: vi.fn() },
      skills: { mode: 'auto', setMode: vi.fn() },
      mcps: { mode: 'auto', setMode: vi.fn(), availableServers: [], selectedIds: [], setSelectedIds: vi.fn() },
    },
    rules: {
      content: '',
      setContent: vi.fn(),
      viewMode: 'preview',
      setViewMode: vi.fn(),
    },
    skills: {
      availableSkills: [],
      selectedSkills: [],
      setSelectedSkills: vi.fn(),
      pendingSkills: [],
      setDeletePendingSkillName: vi.fn(),
      setDeleteCustomSkillName: vi.fn(),
      builtinAutoSkills: [],
      disabledBuiltinSkills: [],
      setDisabledBuiltinSkills: vi.fn(),
    },
    actions: {
      save: vi.fn(),
      requestDelete: vi.fn(),
      duplicate: vi.fn(),
    },
  });

  it('renders a single assistant-editor-page test id', () => {
    render(
      <ConfigProvider>
        <AssistantEditorPage editor={createEditor()} activeAssistant={null} onBack={vi.fn()} />
      </ConfigProvider>
    );

    expect(screen.getAllByTestId('assistant-editor-page')).toHaveLength(1);
    expect(screen.getByTestId('assistant-editor-bar')).toHaveClass('sticky');
    expect(screen.getByTestId('assistant-editor-body')).toBeInTheDocument();
  });

  it('uses a high-contrast back action in the editor header', () => {
    render(
      <ConfigProvider>
        <AssistantEditorPage editor={createEditor()} activeAssistant={null} onBack={vi.fn()} />
      </ConfigProvider>
    );

    expect(screen.getByTestId('btn-back-assistant-editor').className).toContain('text-t-primary');
  });

  it('prefers the editor profile name in the header title', () => {
    const editor = createEditor();
    editor.isCreating = false;
    editor.profile.name = '学术论文助手';

    render(
      <ConfigProvider>
        <AssistantEditorPage
          editor={editor}
          activeAssistant={{
            id: 'builtin-1',
            name: 'Academic Paper',
            source: 'builtin',
            enabled: true,
            sort_order: 1,
            name_i18n: { 'en-US': 'Academic Paper', 'zh-CN': '学术论文助手' },
            description_i18n: {},
            context_i18n: {},
            prompts_i18n: {},
            enabled_skills: [],
            custom_skill_names: [],
            disabled_builtin_skills: [],
            preset_agent_type: 'claude',
            models: [],
          }}
          onBack={vi.fn()}
        />
      </ConfigProvider>
    );

    expect(screen.getByText('学术论文助手')).toBeInTheDocument();
    expect(screen.queryByText('Academic Paper')).not.toBeInTheDocument();
  });

  it('allows saving and hides delete for generated assistants', () => {
    const editor = createEditor();
    editor.isCreating = false;
    editor.profile.name = 'Droid';

    render(
      <ConfigProvider>
        <AssistantEditorPage
          editor={editor}
          activeAssistant={{
            id: 'bare-1',
            name: 'Droid',
            source: 'generated',
            enabled: true,
            sort_order: 1,
            name_i18n: {},
            description_i18n: {},
            context_i18n: {},
            prompts_i18n: {},
            enabled_skills: [],
            custom_skill_names: [],
            disabled_builtin_skills: [],
            preset_agent_type: 'droid',
            models: [],
          }}
          onBack={vi.fn()}
        />
      </ConfigProvider>
    );

    expect(screen.queryByTestId('btn-delete-assistant')).not.toBeInTheDocument();
    expect(screen.getByTestId('btn-save-assistant')).not.toBeDisabled();
  });
});
