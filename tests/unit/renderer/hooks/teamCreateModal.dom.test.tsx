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
  }),
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({
    cliAgents: [
      { id: 'aionrs-runtime', name: 'Aion CLI', backend: 'aionrs', agent_type: 'aionrs', team_capable: true },
    ],
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
  resolveDefaultTeamAgentModel: vi.fn().mockResolvedValue(undefined),
}));

import TeamCreateModal from '@/renderer/pages/team/components/TeamCreateModal';

describe('TeamCreateModal', () => {
  beforeEach(() => {
    createTeamInvokeMock.mockReset();
    createTeamInvokeMock.mockResolvedValue({ id: 'team-1', agents: [] });
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
    expect(payload.agents[0]).toMatchObject({
      role: 'leader',
      custom_agent_id: 'bare-aionrs',
      agent_name: 'Aion CLI',
    });
  });
});

function assistants(): Assistant[] {
  return [
    assistant({
      id: 'bare-aionrs',
      name: 'Aion CLI',
      source: 'bare',
      preset_agent_type: 'aionrs',
      team_selectable: true,
    }),
  ];
}

function assistant(
  overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'name' | 'source' | 'preset_agent_type'>
): Assistant {
  return {
    id: overrides.id,
    source: overrides.source,
    name: overrides.name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    preset_agent_type: overrides.preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    team_selectable: true,
    deletable: false,
    ...overrides,
  };
}
