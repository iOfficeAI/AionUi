/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { TeamPreset } from '@/common/types/team/teamTypes';

const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t,
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const mockAssistants = assistants();

vi.mock('@renderer/pages/conversation/hooks/useConversationAssistants', () => ({
  useConversationAssistants: () => ({
    presetAssistants: mockAssistants,
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Modal: {
      ...actual.Modal,
      confirm: ({ onOk }: { onOk?: () => void }) => {
        onOk?.();
      },
    },
    Input: {
      ...actual.Input,
      TextArea: (props: Record<string, unknown>) => React.createElement('textarea', props),
    },
  };
});

vi.mock('@renderer/components/base/AionModal', () => {
  type HeaderConfig = { render?: () => React.ReactNode; title?: React.ReactNode; subtitle?: React.ReactNode };
  type FooterConfig = { render?: () => React.ReactNode };
  const renderHeader = (header: unknown): React.ReactNode => {
    if (!header || typeof header !== 'object') return header as React.ReactNode;
    const cfg = header as HeaderConfig;
    if (cfg.render) return cfg.render();
    return (
      <div>
        {cfg.title ? <h3 className='text-18px font-600 leading-26px text-t-primary m-0'>{cfg.title}</h3> : null}
        {cfg.subtitle ? <p className='text-13px leading-20px text-t-secondary m-0 mt-4px'>{cfg.subtitle}</p> : null}
      </div>
    );
  };
  const renderFooter = (footer: unknown): React.ReactNode => {
    if (!footer || typeof footer !== 'object') return footer as React.ReactNode;
    const cfg = footer as FooterConfig;
    return cfg.render ? cfg.render() : (footer as React.ReactNode);
  };
  const resolveTestId = (className?: string) => {
    if (typeof className === 'string' && className.includes('team-preset-editor-modal')) {
      return 'team-preset-editor-modal';
    }
    return 'team-create-modal';
  };
  return {
    default: ({ visible, header, footer, children, className }: Record<string, unknown>) =>
      visible ? (
        <div data-testid={resolveTestId(className as string | undefined)}>
          {renderHeader(header)}
          <div>{children as React.ReactNode}</div>
          <div>{renderFooter(footer)}</div>
        </div>
      ) : null,
  };
});

vi.mock('@renderer/components/workspace', () => ({
  WorkspaceFolderSelect: () => <div data-testid='workspace-folder-select' />,
}));

const {
  createTeamInvokeMock,
  resolveDefaultTeamAgentModelMock,
  listTeamPresetsMock,
  createTeamPresetMock,
  updateTeamPresetMock,
  deleteTeamPresetMock,
} = vi.hoisted(() => ({
  createTeamInvokeMock: vi.fn(),
  resolveDefaultTeamAgentModelMock: vi.fn(),
  listTeamPresetsMock: vi.fn(),
  createTeamPresetMock: vi.fn(),
  updateTeamPresetMock: vi.fn(),
  deleteTeamPresetMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      create: { invoke: (...args: unknown[]) => createTeamInvokeMock(...args) },
    },
    teamPreset: {
      list: { invoke: (...args: unknown[]) => listTeamPresetsMock(...args) },
      create: { invoke: (...args: unknown[]) => createTeamPresetMock(...args) },
      update: { invoke: (...args: unknown[]) => updateTeamPresetMock(...args) },
      delete: { invoke: (...args: unknown[]) => deleteTeamPresetMock(...args) },
    },
  },
}));

vi.mock('@renderer/pages/team/components/teamCreateModelResolver', () => ({
  resolveDefaultTeamAgentModel: (...args: unknown[]) => resolveDefaultTeamAgentModelMock(...args),
}));

import TeamCreateModal from '@/renderer/pages/team/components/TeamCreateModal';

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>;
}

function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

describe('TeamCreateModal · presets mode', () => {
  beforeEach(() => {
    createTeamInvokeMock.mockReset();
    createTeamInvokeMock.mockResolvedValue({ id: 'team-1', assistants: [], agents: [] });
    resolveDefaultTeamAgentModelMock.mockReset();
    resolveDefaultTeamAgentModelMock.mockResolvedValue(undefined);

    listTeamPresetsMock.mockReset();
    listTeamPresetsMock.mockResolvedValue([presetDocs(), presetReview()]);
    createTeamPresetMock.mockReset();
    createTeamPresetMock.mockResolvedValue(presetMy());
    updateTeamPresetMock.mockReset();
    updateTeamPresetMock.mockResolvedValue(presetDocs({ name: 'Renamed Docs Team' }));
    deleteTeamPresetMock.mockReset();
    deleteTeamPresetMock.mockResolvedValue(undefined);
  });

  it('switches from assistants tab to expert teams tab', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    const assistantsTab = screen.getByRole('tab', { name: /All assistants/ });
    const expertTab = screen.getByRole('tab', { name: /Expert teams/ });

    expect(assistantsTab).toHaveAttribute('aria-selected', 'true');
    expect(expertTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(expertTab);

    await waitFor(() => expect(screen.getByTestId('team-preset-picker')).toBeInTheDocument());
    expect(assistantsTab).toHaveAttribute('aria-selected', 'false');
    expect(expertTab).toHaveAttribute('aria-selected', 'true');
  });

  it('lists mock presets and selects one for preview', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));

    await waitFor(() => expect(screen.getByTestId('preset-picker-item-preset-docs')).toBeInTheDocument());
    expect(screen.getByTestId('preset-picker-item-preset-review')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('preset-picker-item-preset-docs'));

    await waitFor(() => expect(screen.getByTestId('team-preset-preview')).toBeInTheDocument());
    expect(screen.getByTestId('preset-preview-name')).toHaveTextContent('Documentation Team');
    expect(screen.getByText('technical writing')).toBeInTheDocument();
  });

  it('invokes a preset from the list and fills the existing creation form', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-invoke-preset-docs')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-picker-invoke-preset-docs'));

    await waitFor(() => expect(screen.getByTestId('team-create-agent-search')).toBeInTheDocument());

    const nameInput = screen.getByTestId('team-create-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Documentation Team');

    expect(screen.getAllByTestId(/team-create-member-draft-/)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Current Leader' })).toHaveLength(1);
  });

  it('invokes a preset from the preview card and fills the existing creation form', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-item-preset-docs')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-picker-item-preset-docs'));
    await waitFor(() => expect(screen.getByTestId('preset-preview-invoke')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-preview-invoke'));

    await waitFor(() => expect(screen.getByTestId('team-create-agent-search')).toBeInTheDocument());

    const nameInput = screen.getByTestId('team-create-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Documentation Team');
  });

  it('warns about missing assistants and disables invoke for a preset with unavailable members', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-item-preset-review')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-picker-item-preset-review'));

    await waitFor(() => expect(screen.getByText('Missing')).toBeInTheDocument());
    expect(screen.getByTestId('preset-preview-invoke')).toBeDisabled();
  });

  it('resets mode and selection when the modal is cancelled', async () => {
    const onClose = vi.fn();
    renderWithProviders(<TeamCreateModal visible onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-item-preset-docs')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-picker-item-preset-docs'));
    await waitFor(() => expect(screen.getByTestId('team-preset-preview')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('team-create-agent-search')).toBeVisible();
    expect(screen.queryByTestId('team-preset-preview')).not.toBeInTheDocument();
  });

  it('opens the editor modal when creating a new expert team', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-new')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-picker-new'));

    expect(screen.getByTestId('team-preset-editor-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New expert team' })).toBeInTheDocument();
  });

  it('opens the editor modal with the selected preset when editing', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-more-preset-docs')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-picker-more-preset-docs'));
    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByTestId('team-preset-editor-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit expert team' })).toBeInTheDocument();
    const nameInput = screen.getByTestId('preset-editor-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Documentation Team');
  });

  it('removes a preset after confirming delete', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-item-preset-docs')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('preset-picker-more-preset-docs'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(screen.queryByTestId('preset-picker-item-preset-docs')).not.toBeInTheDocument());
  });

  it('creates a new preset from the editor and shows it in the list', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-new')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-picker-new'));

    fireEvent.change(screen.getByTestId('preset-editor-name'), { target: { value: 'My Preset' } });
    fireEvent.click(screen.getByTestId('preset-editor-agent-option-bare-aionrs'));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByTestId('team-preset-editor-modal')).not.toBeInTheDocument());
    expect(screen.getByText('My Preset')).toBeInTheDocument();
  });

  it('edits an existing preset and reflects the new name in the list', async () => {
    renderWithProviders(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByText('Expert teams'));
    await waitFor(() => expect(screen.getByTestId('preset-picker-more-preset-docs')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-picker-more-preset-docs'));
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByTestId('preset-editor-name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Renamed Docs Team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByTestId('team-preset-editor-modal')).not.toBeInTheDocument());
    expect(screen.getByText('Renamed Docs Team')).toBeInTheDocument();
  });
});

function presetDocs(overrides?: Partial<TeamPreset>): TeamPreset {
  return {
    id: 'preset-docs',
    user_id: 'user-1',
    name: 'Documentation Team',
    category: 'Engineering',
    description: 'Technical writing and documentation review.',
    expertise_tags: ['technical writing'],
    example_prompts: ['Write API docs'],
    leader: {
      assistant_backend: 'acp',
      assistant_id: 'bare-aionrs',
      assistant_name: 'Aion CLI',
      role: 'leader',
      order: 0,
    },
    members: [
      {
        assistant_backend: 'acp',
        assistant_id: 'bare-aionrs',
        assistant_name: 'Aion CLI',
        role: 'leader',
        order: 0,
      },
      {
        assistant_backend: 'custom',
        assistant_id: 'remote-runner',
        assistant_name: 'Remote Runner',
        role: 'teammate',
        order: 1,
      },
    ],
    version: 1,
    created_at: new Date(1700000000000).toISOString(),
    updated_at: new Date(1700000000000).toISOString(),
    ...overrides,
  };
}

function presetReview(): TeamPreset {
  return {
    id: 'preset-review',
    user_id: 'user-1',
    name: 'Review Team',
    category: 'QA',
    description: 'Code review specialists.',
    expertise_tags: ['review'],
    example_prompts: ['Review this PR'],
    leader: {
      assistant_backend: 'custom',
      assistant_id: 'unknown-missing',
      assistant_name: 'Missing Reviewer',
      role: 'leader',
      order: 0,
    },
    members: [
      {
        assistant_backend: 'custom',
        assistant_id: 'unknown-missing',
        assistant_name: 'Missing Reviewer',
        role: 'leader',
        order: 0,
      },
    ],
    version: 1,
    created_at: new Date(1700000000000).toISOString(),
    updated_at: new Date(1700000000000).toISOString(),
  };
}

function presetMy(): TeamPreset {
  return {
    id: 'preset-my',
    user_id: 'user-1',
    name: 'My Preset',
    description: 'Custom preset',
    expertise_tags: [],
    example_prompts: [],
    leader: {
      assistant_backend: 'acp',
      assistant_id: 'bare-aionrs',
      assistant_name: 'Aion CLI',
      role: 'leader',
      order: 0,
    },
    members: [
      {
        assistant_backend: 'acp',
        assistant_id: 'bare-aionrs',
        assistant_name: 'Aion CLI',
        role: 'leader',
        order: 0,
      },
    ],
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function assistants(): Assistant[] {
  return [
    assistant({
      id: 'bare-aionrs',
      name: 'Aion CLI',
      name_i18n: { 'zh-CN': 'Aion 命令行' },
      source: 'generated',
      agent_id: 'agent-aionrs',
      agent: { type: 'aionrs', source: 'internal' },
      team_selectable: true,
    }),
    assistant({
      id: 'remote-runner',
      name: 'Remote Runner',
      source: 'generated',
      agent_id: 'agent-remote',
      agent: { type: 'remote', source: 'custom' },
      team_selectable: true,
    }),
  ];
}

function assistant(overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'name' | 'source' | 'agent_id'>): Assistant {
  return {
    id: overrides.id,
    source: overrides.source,
    name: overrides.name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    agent_id: overrides.agent_id,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    avatar: undefined,
    agent_status: 'online',
    team_selectable: true,
    team_block_reason: undefined,
    deletable: false,
    ...overrides,
  };
}
