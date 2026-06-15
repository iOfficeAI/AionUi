/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';

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
    presetAssistants: assistants(),
  }),
}));

vi.mock('@renderer/components/base/AionModal', () => ({
  default: ({ visible, header, footer, children }: Record<string, unknown>) =>
    visible ? (
      <div data-testid='team-create-modal'>
        {typeof header === 'object' && header && 'render' in header ? (header as { render: () => React.ReactNode }).render() : null}
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
      create: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@renderer/pages/team/components/teamCreateModelResolver', () => ({
  resolveDefaultTeamAgentModel: vi.fn().mockResolvedValue(undefined),
}));

import TeamCreateModal from '@/renderer/pages/team/components/TeamCreateModal';

describe('TeamCreateModal', () => {
  it('keeps blocked assistants visible with a reason and prevents selecting them', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('team-create-agent-option-bare-aionrs')).toBeInTheDocument();
    expect(screen.getByTestId('team-create-agent-option-blocked-reviewer')).toBeInTheDocument();
    expect(screen.getByText('Temporarily unavailable for team mode')).toBeInTheDocument();

    const createButton = screen.getByRole('button', { name: 'Create Team' });
    fireEvent.change(screen.getByPlaceholderText('Team name'), {
      target: { value: 'My Team' },
    });
    fireEvent.click(screen.getByTestId('team-create-agent-option-blocked-reviewer'));

    expect(createButton).toBeDisabled();
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
    assistant({
      id: 'blocked-reviewer',
      name: 'Reviewer',
      source: 'user',
      preset_agent_type: 'claude',
      team_selectable: false,
      team_block_reason: 'Temporarily unavailable for team mode',
      deletable: true,
    }),
  ];
}

function assistant(overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'name' | 'source' | 'preset_agent_type'>): Assistant {
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
    agent_status: 'available',
    team_selectable: true,
    deletable: false,
    ...overrides,
  };
}
