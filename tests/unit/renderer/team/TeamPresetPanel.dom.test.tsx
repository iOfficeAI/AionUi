import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import TeamPresetPanel, { buildTeamPresetInput } from '@renderer/pages/team/components/TeamPresetPanel';
import type { TTeam } from '@/common/types/team/teamTypes';

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    teamPreset: {
      list: { invoke: vi.fn().mockResolvedValue([]) },
      create: { invoke: vi.fn().mockResolvedValue(undefined) },
      delete: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

const team = {
  id: 'team-1',
  user_id: 'user-1',
  name: 'Experts',
  workspace: '',
  workspace_mode: 'shared',
  leader_assistant_id: 'a1',
  assistants: [
    {
      slot_id: 's1',
      conversation_id: 'c1',
      role: 'leader',
      assistant_backend: 'acp',
      assistant_name: 'Lead',
      status: 'idle',
    },
    {
      slot_id: 's2',
      conversation_id: 'c2',
      role: 'teammate',
      assistant_backend: 'aionrs',
      assistant_name: 'Coder',
      status: 'idle',
    },
  ],
  created_at: 1,
  updated_at: 1,
} satisfies TTeam;

describe('TeamPresetPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('builds a backend-compatible preset from a team roster', () => {
    const input = buildTeamPresetInput(team, '  My experts  ', 'user-1');
    expect(input.name).toBe('My experts');
    expect(input.user_id).toBe('user-1');
    expect(input.leader.assistant_name).toBe('Lead');
    expect(input.members).toHaveLength(1);
    expect(input.members[0]?.assistant_backend).toBe('aionrs');
  });

  it('renders the save preset entry for an active team', () => {
    render(<TeamPresetPanel visible team={team} onClose={vi.fn()} />);

    expect(screen.getByTestId('team-preset-save-btn')).toBeInTheDocument();
  });
});
