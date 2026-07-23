/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import { MemoryRouter } from 'react-router-dom';
import AssistantSettings from '@/renderer/pages/settings/AssistantSettings';
import EnabledAssistantsList from '@/renderer/pages/settings/AssistantSettings/home/EnabledAssistantsList';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';

const useAssistantListMock = vi.fn();
const useAssistantEditorMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      useMessage: () => [{ success: vi.fn(), error: vi.fn(), warning: vi.fn() }, <div key='message-context' />],
    },
  };
});

vi.mock('@/renderer/hooks/assistant', () => ({
  useAssistantList: () => useAssistantListMock(),
  useAssistantEditor: (params: unknown) => useAssistantEditorMock(params),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/AssistantEditorPage', () => ({
  default: () => <div data-testid='assistant-editor-page' />,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/AssistantListPanel', () => ({
  default: () => <div data-testid='assistant-list-panel' />,
}));

vi.mock('@/renderer/utils/model/agentLogo', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/utils/model/agentLogo')>(
    '@/renderer/utils/model/agentLogo'
  );
  return { ...actual, useAgentLogos: () => ({}) };
});

vi.mock('@/renderer/pages/settings/AssistantSettings/DeleteAssistantModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/SkillConfirmModals', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/assistantUtils', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/pages/settings/AssistantSettings/assistantUtils')>(
    '@/renderer/pages/settings/AssistantSettings/assistantUtils'
  );

  return {
    ...actual,
    resolveAvatarImageSrc: (avatar?: string) => avatar,
  };
});

describe('AssistantSettings', () => {
  beforeEach(() => {
    useAssistantListMock.mockReturnValue({
      assistants: [],
      activeAssistantId: 'assistant-1',
      setActiveAssistantId: vi.fn(),
      activeAssistant: null,
      loadAssistants: vi.fn(),
      reorderEnabledAssistants: vi.fn(),
      assistantOrder: [],
      setAssistantOrder: vi.fn(),
      localeKey: 'en-US',
    });

    useAssistantEditorMock.mockReturnValue({
      editVisible: true,
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
      defaultSkillsMode: 'fixed',
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
      setDeletePendingSkillName: vi.fn(),
      setDeleteCustomSkillName: vi.fn(),
      builtinAutoSkills: [],
      disabledBuiltinSkills: [],
      setDisabledBuiltinSkills: vi.fn(),
      handleSave: vi.fn(),
      handleDeleteClick: vi.fn(),
      handleDuplicate: vi.fn(),
      handleDeleteRequest: vi.fn(),
      handleToggleEnabled: vi.fn(),
      handleEdit: vi.fn(),
      handleCreate: vi.fn(),
      deleteConfirmVisible: false,
      setDeleteConfirmVisible: vi.fn(),
      deletePendingSkillName: null,
      deleteCustomSkillName: null,
      customSkills: [],
      setCustomSkills: vi.fn(),
      setPendingSkills: vi.fn(),
      handleDeleteConfirm: vi.fn(),
      setEditVisible: vi.fn(),
    });
  });

  it('keeps the editor visible when an existing assistant session is open and activeAssistant is temporarily null', () => {
    render(
      <ConfigProvider>
        <MemoryRouter>
          <AssistantSettings />
        </MemoryRouter>
      </ConfigProvider>
    );

    expect(screen.getByTestId('assistant-editor-page')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-list-panel')).not.toBeInTheDocument();
  });

  it('renders enabled assistants in one preferred cross-source list', () => {
    const assistants = [
      {
        id: 'cli',
        name: 'Codex',
        sort_order: 1,
        source: 'generated',
        enabled: true,
        agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
      },
      {
        id: 'custom',
        name: 'My Writer',
        sort_order: 2,
        source: 'user',
        enabled: true,
        agent: { type: 'acp', source: 'builtin', acp_backend: 'gemini' },
      },
      {
        id: 'official',
        name: 'Cowork',
        sort_order: 3,
        source: 'builtin',
        enabled: true,
        agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
      },
      {
        id: 'disabled',
        name: 'Disabled',
        sort_order: 4,
        source: 'builtin',
        enabled: false,
      },
    ] as AssistantListItem[];

    render(
      <ConfigProvider>
        <EnabledAssistantsList
          assistants={assistants}
          assistantOrder={['official', 'custom', 'cli']}
          localeKey='en-US'
          searchActive={false}
          onOpenDetail={vi.fn()}
          onToggleEnabled={vi.fn()}
          onReorder={vi.fn()}
        />
      </ConfigProvider>
    );

    const rows = screen.getAllByTestId(/^enabled-assistant-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'enabled-assistant-row-official',
      'enabled-assistant-row-custom',
      'enabled-assistant-row-cli',
    ]);
    expect(screen.queryByTestId('enabled-assistant-row-disabled')).not.toBeInTheDocument();
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('CLI')).toBeInTheDocument();
    // Runtime engine is shown with a label + logo (same "Agent: {logo}" style as
    // the My Assistants cards, i18n key `assistantRuntimeLabel`), not a bare
    // backend name. The label renders once per enabled row.
    expect(screen.getAllByTestId(/^assistant-runtime-/).length).toBe(3);
    expect(screen.queryByText('claude')).not.toBeInTheDocument();
    // Each enabled row exposes an enable switch so users can disable in place.
    expect(screen.getByTestId('switch-enabled-official')).toBeInTheDocument();
    expect(screen.getByTestId('switch-enabled-cli')).toBeInTheDocument();
  });

  it('disables enabled-assistant dragging while search is active', () => {
    const assistants = [
      { id: 'cli', name: 'Codex', sort_order: 1, source: 'generated', enabled: true },
      { id: 'official', name: 'Cowork', sort_order: 2, source: 'builtin', enabled: true },
    ] as AssistantListItem[];

    render(
      <ConfigProvider>
        <EnabledAssistantsList
          assistants={assistants}
          assistantOrder={[]}
          localeKey='en-US'
          searchActive
          onOpenDetail={vi.fn()}
          onToggleEnabled={vi.fn()}
          onReorder={vi.fn()}
        />
      </ConfigProvider>
    );

    expect(screen.getByTestId('enabled-reorder-search-hint')).toHaveTextContent('Clear search to reorder.');
    expect(screen.getByTestId('enabled-assistant-reorder-handle-cli')).toBeDisabled();
    expect(screen.getByTestId('enabled-assistant-reorder-handle-official')).toBeDisabled();
  });

  it('uses the homepage avatar treatment without cropping runtime logos', () => {
    const assistants = [
      {
        id: 'claude',
        name: 'Claude',
        avatar: 'https://example.com/claude.svg',
        sort_order: 1,
        source: 'generated',
        enabled: true,
        agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
      },
    ] as AssistantListItem[];

    render(
      <ConfigProvider>
        <EnabledAssistantsList
          assistants={assistants}
          assistantOrder={[]}
          localeKey='en-US'
          searchActive={false}
          onOpenDetail={vi.fn()}
          onToggleEnabled={vi.fn()}
          onReorder={vi.fn()}
        />
      </ConfigProvider>
    );

    const row = screen.getByTestId('enabled-assistant-row-claude');
    expect(row.querySelector('.arco-avatar-circle')).toHaveStyle({ height: '20px', width: '20px' });
    expect(row.querySelector('img')).toHaveClass('object-contain');
  });
});
