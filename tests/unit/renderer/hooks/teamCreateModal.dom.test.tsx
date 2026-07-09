/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';

const createTeamInvokeMock = vi.fn();
const resolveDefaultTeamAgentModelMock = vi.fn();
const messageErrorMock = vi.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAssistants', () => ({
  useConversationAssistants: () => ({
    presetAssistants: assistants(),
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      ...actual.Message,
      error: (...args: unknown[]) => messageErrorMock(...args),
    },
  };
});

// Mirror AionModal's real prop contract: header/footer may be config objects.
// The standard variant renders the title as an <h3> (text-18px) and the optional
// subtitle as a <p> (text-13px leading-20px); footer is rendered via footer.render().
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
  return {
    default: ({ visible, header, footer, children, style }: Record<string, unknown>) =>
      visible ? (
        <div
          data-testid='team-create-modal'
          data-width={(style as React.CSSProperties | undefined)?.width}
          data-max-width={(style as React.CSSProperties | undefined)?.maxWidth}
        >
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

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      create: { invoke: (...args: unknown[]) => createTeamInvokeMock(...args) },
    },
  },
}));

vi.mock('@renderer/pages/team/components/teamCreateModelResolver', () => ({
  resolveDefaultTeamAgentModel: (...args: unknown[]) => resolveDefaultTeamAgentModelMock(...args),
}));

import TeamCreateModal from '@/renderer/pages/team/components/TeamCreateModal';
import { LayoutContext } from '@/renderer/hooks/context/LayoutContext';

// Render inside a LayoutContext flagged as mobile so the component takes the
// narrow-screen branch (single column + bottom-sheet assistant picker).
const renderMobile = (ui: React.ReactElement) =>
  render(
    <LayoutContext.Provider value={{ isMobile: true, siderCollapsed: false, setSiderCollapsed: () => {} }}>
      {ui}
    </LayoutContext.Provider>
  );

describe('TeamCreateModal', () => {
  beforeEach(() => {
    createTeamInvokeMock.mockReset();
    createTeamInvokeMock.mockResolvedValue({ id: 'team-1', assistants: [], agents: [] });
    resolveDefaultTeamAgentModelMock.mockReset();
    resolveDefaultTeamAgentModelMock.mockResolvedValue(undefined);
    messageErrorMock.mockReset();
  });

  it('keeps blocked assistants visible and prevents selecting them', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('team-create-agent-option-bare-aionrs')).toBeInTheDocument();
    expect(screen.getByText('Aion 命令行')).toBeInTheDocument();
    expect(screen.queryByText('Aion CLI')).not.toBeInTheDocument();
    expect(screen.getByTestId('team-create-agent-option-blocked-reviewer')).toBeInTheDocument();
    expect(screen.getByTestId('team-create-agent-option-remote-runner')).toBeInTheDocument();
    expect(screen.queryByText('Agent internal error (code -32603)')).not.toBeInTheDocument();

    const createButton = screen.getByRole('button', { name: 'Confirm Create' });
    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'My Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-blocked-reviewer'));

    expect(createButton).toBeDisabled();
  });

  it('keeps blocked assistant rows single-line while the reason stays out of the row', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    const blockedOption = screen.getByTestId('team-create-agent-option-blocked-reviewer');
    const rowContent = blockedOption.querySelector('[data-testid="team-assistant-picker-row-content"]');

    expect(blockedOption).toHaveClass('!h-44px');
    expect(blockedOption).not.toHaveClass('!h-auto', '!min-h-56px');
    expect(rowContent).toHaveClass('w-full', 'items-center', 'justify-between');
    expect(rowContent).not.toHaveClass('flex-col');
    expect(screen.queryByText('Agent internal error (code -32603)')).not.toBeInTheDocument();
  });

  it('renders blocked assistant rows as muted and non-actionable', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    const blockedOption = screen.getByTestId('team-create-agent-option-blocked-reviewer');
    const rowContent = blockedOption.querySelector('[data-testid="team-assistant-picker-row-content"]');
    const optionName = blockedOption.querySelector('[data-testid="assistant-option-name"]');
    const addIcon = blockedOption.querySelector('[data-testid="team-assistant-picker-add-icon"]');

    expect(blockedOption.tagName).toBe('BUTTON');
    expect(blockedOption).toHaveAttribute('aria-disabled', 'true');
    expect(blockedOption).toHaveAttribute('tabindex', '-1');
    expect(blockedOption).toHaveClass('w-full');
    expect(blockedOption).not.toHaveClass('hover:!bg-fill-2');
    expect(rowContent).toHaveClass('cursor-not-allowed', 'text-t-tertiary');
    expect(rowContent).toHaveClass('w-full', 'items-center', 'justify-between');
    expect(optionName).toHaveClass('text-t-tertiary');
    expect(addIcon).toHaveClass('flex', 'h-30px', 'w-30px', 'items-center', 'justify-center', 'text-t-quaternary');
    expect(addIcon).not.toHaveClass('mt-7px');
  });

  it('renders the reference two-column creation layout with details on the selected-member side', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    const subtitle =
      'Let multiple AI assistants team up and collaborate. We suggest one team focuses on a single goal — create separate teams for different tasks.';
    expect(screen.getByRole('heading', { name: 'New Team' })).toBeInTheDocument();
    expect(screen.getByText(subtitle)).toBeInTheDocument();
    expect(screen.getByTestId('team-create-modal')).toHaveAttribute('data-width', '900');
    expect(screen.getByTestId('team-create-modal')).toHaveAttribute('data-max-width', 'calc(100vw - 72px)');
    expect(screen.getByRole('heading', { name: 'New Team' })).toHaveClass('text-18px');
    expect(screen.getByText(subtitle)).toHaveClass('text-13px', 'leading-20px');

    const assistantPane = screen.getByTestId('team-create-assistant-pane');
    const detailsPane = screen.getByTestId('team-create-details-pane');
    const layout = screen.getByTestId('team-create-layout');
    const searchInput = within(assistantPane).getByTestId('team-create-agent-search');
    const nameInput = within(detailsPane).getByTestId('team-create-name-input');

    expect(layout).toHaveStyle({ height: 'min(54vh, 470px)', minHeight: '390px' });
    expect(assistantPane).toHaveClass('px-20px', 'pt-12px', 'pb-18px');
    expect(detailsPane).toHaveClass('px-20px', 'pt-12px', 'pb-14px');
    expect(within(assistantPane).getByText('All assistants (3)')).toBeInTheDocument();
    expect(within(assistantPane).getByText('All assistants (3)')).toHaveClass('text-15px');
    expect(searchInput.tagName).toBe('INPUT');
    expect(searchInput).toHaveAttribute('placeholder', 'Search');
    expect(within(assistantPane).getByTestId('team-create-agent-picker-body')).not.toHaveClass('bg-fill-1');
    expect(within(assistantPane).getByTestId('team-create-agent-picker-body')).toHaveClass('bg-dialog-fill-0');
    expect(within(assistantPane).getByTestId('team-create-agent-option-bare-aionrs')).toHaveClass('!h-44px');
    expect(within(assistantPane).getByTestId('team-create-agent-option-bare-aionrs')).toHaveClass('hover:!bg-fill-2');
    expect(within(detailsPane).getByText('Selected members 0')).toBeInTheDocument();
    expect(within(detailsPane).getByText('Selected members 0')).toHaveClass('text-15px');
    expect(nameInput).toHaveClass('!h-38px', '!text-13px');
    expect(within(detailsPane).getByTestId('workspace-folder-select')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Create' })).toHaveClass('!h-38px', '!text-13px');
  });

  it('passes assistant identity through when creating a team with an assistant leader', async () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'Docs Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Create' }));

    await waitFor(() => expect(createTeamInvokeMock).toHaveBeenCalledTimes(1));

    const payload = createTeamInvokeMock.mock.calls[0][0];
    expect(resolveDefaultTeamAgentModelMock).toHaveBeenCalledWith({
      assistant_id: 'bare-aionrs',
      assistant_backend: 'aionrs',
    });
    expect(payload.agents[0]).toMatchObject({
      role: 'leader',
      assistant_id: 'bare-aionrs',
      assistant_name: 'Aion 命令行',
    });
    // Runtime backend / conversation type are derived server-side from the
    // assistant, so the create payload no longer carries legacy agent fields.
    expect(payload.agents[0]).not.toHaveProperty('assistant_backend');
    expect(payload.agents[0]).not.toHaveProperty('conversation_type');
    expect(payload.agents[0]).not.toHaveProperty('custom_agent_id');
    expect(payload.agents[0]).not.toHaveProperty('agent_name');
    expect(payload.agents[0]).not.toHaveProperty('agent_type');
    expect(payload).not.toHaveProperty('assistants');
  });

  it('selectedMembers_allows_duplicate_assistant_instances', async () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'Duplicate Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Create' }));

    await waitFor(() => expect(createTeamInvokeMock).toHaveBeenCalledTimes(1));

    const payload = createTeamInvokeMock.mock.calls[0][0];
    expect(payload.agents).toHaveLength(2);
    expect(payload.agents.map((agent: { assistant_id?: string }) => agent.assistant_id)).toEqual([
      'bare-aionrs',
      'bare-aionrs',
    ]);
    expect(payload.agents.filter((agent: { role: string }) => agent.role === 'leader')).toHaveLength(1);
  });

  it('first_selected_member_becomes_leader', async () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'Manual Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByTestId('team-create-agent-option-remote-runner'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Create' }));

    await waitFor(() => expect(createTeamInvokeMock).toHaveBeenCalledTimes(1));

    const payload = createTeamInvokeMock.mock.calls[0][0];
    expect(payload.agents.map((agent: { role: string }) => agent.role)).toEqual(['leader', 'teammate']);
  });

  it('switching_leader_serializes_exactly_one_leader', async () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'Switch Leader Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByTestId('team-create-agent-option-remote-runner'));
    fireEvent.click(screen.getByRole('button', { name: 'Set as Leader' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Create' }));

    await waitFor(() => expect(createTeamInvokeMock).toHaveBeenCalledTimes(1));

    const payload = createTeamInvokeMock.mock.calls[0][0];
    expect(payload.agents.map((agent: { role: string }) => agent.role)).toEqual(['teammate', 'leader']);
    expect(payload.agents.filter((agent: { role: string }) => agent.role === 'leader')).toHaveLength(1);
  });

  it('leader_flag_controls_show_and_switch_a_single_active_leader', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByTestId('team-create-agent-option-remote-runner'));
    fireEvent.click(screen.getByTestId('team-create-agent-option-remote-runner'));

    const rows = screen.getAllByTestId(/team-create-member-draft-/);
    expect(rows).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Current Leader' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Set as Leader' })).toHaveLength(2);
    expect(within(rows[0]).getByRole('button', { name: 'Current Leader' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rows[1]).getByRole('button', { name: 'Set as Leader' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(within(rows[2]).getByRole('button', { name: 'Set as Leader' }));

    expect(screen.getAllByRole('button', { name: 'Current Leader' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Set as Leader' })).toHaveLength(2);
    expect(within(rows[0]).getByRole('button', { name: 'Set as Leader' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(rows[2]).getByRole('button', { name: 'Current Leader' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('removing_leader_promotes_first_remaining_member', async () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'Promote Leader Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByTestId('team-create-agent-option-remote-runner'));
    fireEvent.click(screen.getAllByTestId(/team-create-member-remove-/)[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Create' }));

    await waitFor(() => expect(createTeamInvokeMock).toHaveBeenCalledTimes(1));

    const payload = createTeamInvokeMock.mock.calls[0][0];
    expect(payload.agents).toEqual([
      expect.objectContaining({
        role: 'leader',
        assistant_id: 'remote-runner',
      }),
    ]);
  });

  it('model_resolution_failure_blocks_create_and_names_assistant', async () => {
    resolveDefaultTeamAgentModelMock.mockImplementation(({ assistant_id }: { assistant_id: string }) => {
      if (assistant_id === 'remote-runner') {
        return Promise.reject(new Error('model unavailable'));
      }
      return Promise.resolve('model-ok');
    });
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'Model Failure Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByTestId('team-create-agent-option-remote-runner'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Create' }));

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalled());

    expect(createTeamInvokeMock).not.toHaveBeenCalled();
    expect(String(messageErrorMock.mock.calls[0][0])).toContain('Remote Runner');
  });
});

describe('TeamCreateModal · mobile (narrow screen)', () => {
  beforeEach(() => {
    createTeamInvokeMock.mockReset();
    createTeamInvokeMock.mockResolvedValue({ id: 'team-1', assistants: [], agents: [] });
    resolveDefaultTeamAgentModelMock.mockReset();
    resolveDefaultTeamAgentModelMock.mockResolvedValue(undefined);
    messageErrorMock.mockReset();
  });

  it('renders the single-column mobile layout instead of the desktop two-column one', () => {
    renderMobile(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    // Narrow layout root is present; the desktop two-column root is not rendered.
    expect(screen.getByTestId('team-create-layout-mobile')).toBeInTheDocument();
    expect(screen.queryByTestId('team-create-layout')).not.toBeInTheDocument();

    // Header/footer copy stays aligned with desktop (same i18n keys).
    expect(screen.getByRole('heading', { name: 'New Team' })).toBeInTheDocument();
    expect(screen.getByText('Selected members 0')).toBeInTheDocument();
    expect(screen.getByTestId('team-create-name-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Create' })).toBeDisabled();

    // The add-member trigger is present; the assistant dropdown is closed until opened.
    expect(screen.getByTestId('team-create-add-member-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('team-create-agent-search')).not.toBeInTheDocument();
  });

  it('opens the assistant dropdown, adds a member, and closes on select', async () => {
    renderMobile(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('team-create-add-member-btn'));

    // Dropdown reveals the reused picker (same search box + options as desktop).
    await waitFor(() => expect(screen.getByTestId('team-create-agent-search')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));

    // Select-and-close: the dropdown collapses so the user sees the result below.
    await waitFor(() => expect(screen.queryByTestId('team-create-agent-search')).not.toBeInTheDocument());

    // The member now shows in the list and create becomes actionable — logic shared with desktop.
    expect(screen.getByText('Selected members 1')).toBeInTheDocument();
    expect(screen.getByTestId('team-create-member-list-box')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('team-create-name-input'), { target: { value: 'Mobile Team' } });
    expect(screen.getByRole('button', { name: 'Confirm Create' })).toBeEnabled();
  });

  it('creates a team from the mobile flow with the first member as leader', async () => {
    renderMobile(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('team-create-add-member-btn'));
    await waitFor(() => expect(screen.getByTestId('team-create-agent-search')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.change(screen.getByTestId('team-create-name-input'), { target: { value: 'Mobile Team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Create' }));

    await waitFor(() => expect(createTeamInvokeMock).toHaveBeenCalledTimes(1));
    const payload = createTeamInvokeMock.mock.calls[0][0];
    expect(payload.name).toBe('Mobile Team');
    expect(payload.agents[0]).toMatchObject({ role: 'leader', assistant_id: 'bare-aionrs' });
  });
});

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
      id: 'blocked-reviewer',
      name: 'Reviewer',
      source: 'user',
      agent_id: 'agent-claude',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
      team_selectable: false,
      team_block_reason: 'Agent internal error (code -32603)',
      deletable: true,
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
