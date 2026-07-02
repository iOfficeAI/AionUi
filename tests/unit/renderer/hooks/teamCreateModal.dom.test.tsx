/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';

const createTeamInvokeMock = vi.fn();
const resolveDefaultTeamAgentModelMock = vi.fn();

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

vi.mock('@renderer/components/base/AionModal', () => ({
  default: ({ visible, header, footer, children }: Record<string, unknown>) =>
    visible ? (
      <div data-testid='team-create-modal'>
        {typeof header === 'object' && header && 'render' in header
          ? (header as { render: () => React.ReactNode }).render()
          : null}
        <div>{children as React.ReactNode}</div>
        <div>{footer as React.ReactNode}</div>
      </div>
    ) : null,
}));

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

describe('TeamCreateModal', () => {
  beforeEach(() => {
    createTeamInvokeMock.mockReset();
    createTeamInvokeMock.mockResolvedValue({ id: 'team-1', assistants: [], agents: [] });
    resolveDefaultTeamAgentModelMock.mockReset();
    resolveDefaultTeamAgentModelMock.mockResolvedValue(undefined);
  });

  it('keeps blocked assistants visible with a reason and prevents selecting them', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('team-create-agent-option-bare-aionrs')).toBeInTheDocument();
    expect(screen.getByText('Aion 命令行')).toBeInTheDocument();
    expect(screen.queryByText('Aion CLI')).not.toBeInTheDocument();
    expect(screen.getByTestId('team-create-agent-option-blocked-reviewer')).toBeInTheDocument();
    expect(screen.getByTestId('team-create-agent-option-remote-runner')).toBeInTheDocument();
    // The backend block reason is English; the UI shows a localized message instead.
    expect(screen.getByText('This assistant cannot be used in team mode right now.')).toBeInTheDocument();

    const createButton = screen.getByRole('button', { name: 'Create Team' });
    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'My Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-blocked-reviewer'));

    expect(createButton).toBeDisabled();
  });

  it('passes assistant identity through when creating a team with an assistant leader', async () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'Docs Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-bare-aionrs'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }));

    await waitFor(() => expect(createTeamInvokeMock).toHaveBeenCalledTimes(1));

    const payload = createTeamInvokeMock.mock.calls[0][0];
    expect(resolveDefaultTeamAgentModelMock).toHaveBeenCalledWith({
      assistant_id: 'bare-aionrs',
      assistant_backend: 'aionrs',
    });
    expect(payload.assistants[0]).toMatchObject({
      role: 'leader',
      assistant_id: 'bare-aionrs',
      assistant_name: 'Aion 命令行',
    });
    // Runtime backend / conversation type are derived server-side from the
    // assistant, so the create payload no longer carries legacy agent fields.
    expect(payload.assistants[0]).not.toHaveProperty('assistant_backend');
    expect(payload.assistants[0]).not.toHaveProperty('conversation_type');
    expect(payload.assistants[0]).not.toHaveProperty('custom_agent_id');
    expect(payload.assistants[0]).not.toHaveProperty('agent_name');
    expect(payload.assistants[0]).not.toHaveProperty('agent_type');
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
      team_block_reason: 'Temporarily unavailable for team mode',
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
