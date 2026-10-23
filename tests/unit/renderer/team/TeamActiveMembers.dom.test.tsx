import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TeamAssistant, TeammateStatus } from '@/common/types/team/teamTypes';
import { TeamActiveMembers } from '@/renderer/pages/team/components/TeamTabs';

vi.mock('@/renderer/pages/team/components/AgentStatusBadge', () => ({
  default: ({ status, testId }: { status: string; testId?: string }) => (
    <span data-testid={testId ?? `status-badge-${status}`} data-status={status} />
  ),
}));

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  default: ({
    assistant_name,
    nameTestId,
    avatarOverlay,
  }: {
    assistant_name: string;
    nameTestId?: string;
    avatarOverlay?: React.ReactNode;
  }) => (
    <span data-testid={nameTestId}>
      {assistant_name}
      {avatarOverlay}
    </span>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string; defaultValue?: string }) =>
      opts?.defaultValue ?? (opts?.name ? `${opts.name} is working` : key),
  }),
}));

const mockAssistants: TeamAssistant[] = [
  {
    slot_id: 'slot-leader',
    conversation_id: 'conv-leader',
    role: 'leader',
    assistant_backend: 'claude',
    assistant_name: 'Shiraj',
    status: 'idle',
  },
  {
    slot_id: 'slot-planner',
    conversation_id: 'conv-planner',
    role: 'teammate',
    assistant_backend: 'claude',
    assistant_name: 'Planner',
    status: 'idle',
  },
  {
    slot_id: 'slot-writer',
    conversation_id: 'conv-writer',
    role: 'teammate',
    assistant_backend: 'claude',
    assistant_name: 'Scriptwriter',
    status: 'idle',
  },
];

describe('TeamActiveMembers', () => {
  it('renders nothing when no members are active', () => {
    const statusMap = new Map<string, { status: TeammateStatus }>([
      ['slot-leader', { status: 'idle' }],
      ['slot-planner', { status: 'idle' }],
      ['slot-writer', { status: 'completed' }],
    ]);

    const { container } = render(
      <TeamActiveMembers
        assistants={mockAssistants}
        statusMap={statusMap}
        colorOf={() => '#000'}
        onSelectMember={vi.fn()}
      />
    );

    expect(screen.queryByTestId('team-active-members')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders active members when their status is active in statusMap', () => {
    const statusMap = new Map<string, { status: TeammateStatus }>([
      ['slot-leader', { status: 'active' }],
      ['slot-planner', { status: 'active' }],
      ['slot-writer', { status: 'idle' }],
    ]);

    render(
      <TeamActiveMembers
        assistants={mockAssistants}
        statusMap={statusMap}
        colorOf={() => '#ff0000'}
        onSelectMember={vi.fn()}
      />
    );

    expect(screen.getByTestId('team-active-members')).toBeInTheDocument();
    expect(screen.getByTestId('team-active-member-slot-leader')).toBeInTheDocument();
    expect(screen.getByTestId('team-active-member-slot-planner')).toBeInTheDocument();
    expect(screen.queryByTestId('team-active-member-slot-writer')).not.toBeInTheDocument();
    expect(screen.getByText('Shiraj')).toBeInTheDocument();
    expect(screen.getByText('Planner')).toBeInTheDocument();
  });

  it('detects active members when slotWork is running or starting', () => {
    const statusMap = new Map<string, { status: TeammateStatus }>();
    const slotWorkBySlot = {
      'slot-writer': {
        slot_id: 'slot-writer',
        team_id: 'team-1',
        state: 'running' as const,
      },
    };

    render(
      <TeamActiveMembers
        assistants={mockAssistants}
        statusMap={statusMap}
        colorOf={() => '#ff0000'}
        onSelectMember={vi.fn()}
        slotWorkBySlot={slotWorkBySlot}
      />
    );

    expect(screen.getByTestId('team-active-member-slot-writer')).toBeInTheDocument();
    expect(screen.getByText('Scriptwriter')).toBeInTheDocument();
  });

  it('triggers onSelectMember when clicked or Enter pressed', () => {
    const onSelectMember = vi.fn();
    const statusMap = new Map<string, { status: TeammateStatus }>([['slot-planner', { status: 'active' }]]);

    render(
      <TeamActiveMembers
        assistants={mockAssistants}
        statusMap={statusMap}
        colorOf={() => '#ff0000'}
        onSelectMember={onSelectMember}
      />
    );

    const plannerPill = screen.getByTestId('team-active-member-slot-planner');
    fireEvent.click(plannerPill);
    expect(onSelectMember).toHaveBeenCalledWith('slot-planner');

    fireEvent.keyDown(plannerPill, { key: 'Enter' });
    expect(onSelectMember).toHaveBeenCalledTimes(2);
  });
});
