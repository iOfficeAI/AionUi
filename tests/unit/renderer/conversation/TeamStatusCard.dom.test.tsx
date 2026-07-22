/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamStatusCard } from '@/renderer/pages/conversation/components/AdHocTeam/TeamStatusCard';
import type { ITeamRunEvent, ITeamSlotWork, TTeam, TeamAssistant } from '@/common/types/team/teamTypes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, options?: Record<string, unknown>) => {
      let text = k;
      if (options && typeof options === 'object') {
        for (const [key, value] of Object.entries(options)) {
          if (key === 'defaultValue' && typeof value === 'string') {
            text = value;
          }
        }
        for (const [key, value] of Object.entries(options)) {
          if (key !== 'defaultValue') {
            text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
          }
        }
      }
      return text;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

describe('TeamStatusCard', () => {
  const onNavigate = vi.fn();
  const teamId = 'team-123';
  const teamName = 'Alpha Team';

  function mockAssistant(overrides?: Partial<TeamAssistant>): TeamAssistant {
    return {
      slot_id: 'slot-1',
      conversation_id: 'conv-member',
      role: 'teammate',
      assistant_backend: 'codex',
      assistant_name: 'Assistant',
      status: 'idle',
      pending_confirmations: 0,
      ...overrides,
    };
  }

  function mockTeam(overrides?: Partial<TTeam>): TTeam {
    return {
      id: teamId,
      user_id: 'user-1',
      name: teamName,
      workspace: '/tmp/team',
      workspace_mode: 'shared',
      leader_assistant_id: 'leader-1',
      assistants: [
        mockAssistant({ slot_id: 'slot-lead', role: 'leader', assistant_name: 'Leader', status: 'active' }),
        mockAssistant({ slot_id: 'slot-a', role: 'teammate', assistant_name: 'Teammate A', status: 'idle' }),
      ],
      created_at: 1,
      updated_at: 2,
      ...overrides,
    };
  }

  function mockSlotWork(overrides?: Partial<ITeamSlotWork>): ITeamSlotWork {
    return {
      slot_id: 'slot-1',
      role: 'teammate',
      state: 'idle',
      queued_foreground_count: 0,
      queued_background_count: 0,
      active_turn_id: null,
      active_turn_started_at_ms: null,
      active_turn_elapsed_ms: null,
      active_turn_slow: null,
      active_turn_slow_threshold_ms: null,
      blocked_reason: null,
      team_run_id: null,
      ...overrides,
    };
  }

  function mockRunEvent(overrides?: Partial<ITeamRunEvent>): ITeamRunEvent {
    return {
      team_id: teamId,
      team_run_id: 'run-1',
      source: 'user_message',
      has_user_intervention: false,
      target_slot_id: 'slot-lead',
      target_role: 'lead',
      status: 'running',
      queued_intent_count: 0,
      starting_batch_count: 0,
      running_batch_count: 1,
      active_enqueue_lease_count: 1,
      slot_work: [
        mockSlotWork({ slot_id: 'slot-lead', role: 'lead', state: 'running', active_turn_id: 'turn-1' }),
        mockSlotWork({ slot_id: 'slot-a', role: 'teammate', state: 'idle' }),
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when there is no team association', () => {
    render(<TeamStatusCard association={null} onNavigate={onNavigate} />);
    expect(screen.queryByTestId('team-status-card')).not.toBeInTheDocument();
  });

  it('does not render when the association has no team_id', () => {
    render(
      <TeamStatusCard
        association={{ team_id: '', origin_conversation_id: 'conv-1', status: 'active' }}
        onNavigate={onNavigate}
      />
    );
    expect(screen.queryByTestId('team-status-card')).not.toBeInTheDocument();
  });

  it('renders a compact card when a team association exists', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('team-status-card')).toBeInTheDocument();
    expect(screen.getByTestId('team-status-card-title')).toHaveTextContent('Team');
  });

  it('shows the team name when available', () => {
    render(
      <TeamStatusCard
        association={{
          team_id: teamId,
          origin_conversation_id: 'conv-1',
          status: 'active',
          team: { id: teamId, name: teamName } as never,
        }}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('team-status-card-name')).toHaveTextContent(teamName);
  });

  it('shows the team id fallback when team name is unavailable', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('team-status-card-name')).toHaveTextContent(teamId);
  });

  it('calls onNavigate with the team id when clicked', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
        onNavigate={onNavigate}
      />
    );
    fireEvent.click(screen.getByTestId('team-status-card'));
    expect(onNavigate).toHaveBeenCalledWith(teamId);
  });

  it('shows an active status indicator for active associations', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('team-status-card-indicator')).toHaveAttribute('aria-label', 'active');
  });

  it('shows a completed status indicator for disbanded associations', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'disbanded' }}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('team-status-card-indicator')).toHaveAttribute('aria-label', 'completed');
  });

  it('navigates to origin conversation when disbanded team card is clicked', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-origin', status: 'disbanded' }}
        onNavigate={onNavigate}
      />
    );
    fireEvent.click(screen.getByTestId('team-status-card'));
    expect(onNavigate).not.toHaveBeenCalledWith(teamId);
    expect(onNavigate).toHaveBeenCalledWith('conv-origin');
  });

  it('renders disbanded label text when team is disbanded', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'disbanded' }}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('team-status-card')).toHaveTextContent(/disbanded/i);
  });

  it('renders member summary and unread badge when team summary is provided', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
        team={mockTeam()}
        teammates={mockTeam().assistants}
        unreadTeammateMessageCount={3}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('team-status-card-member-count')).toHaveTextContent('2');
    expect(screen.getByTestId('team-status-card-unread-count')).toHaveTextContent('3');
  });

  it('does not render message preview when there is no latest message', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
        team={mockTeam()}
        onNavigate={onNavigate}
      />
    );
    expect(screen.queryByTestId('team-status-card-message-preview')).not.toBeInTheDocument();
  });

  it('does not render unread badge when count is zero', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
        team={mockTeam()}
        teammates={mockTeam().assistants}
        unreadTeammateMessageCount={0}
        onNavigate={onNavigate}
      />
    );
    expect(screen.queryByTestId('team-status-card-unread-count')).not.toBeInTheDocument();
  });

  it('does not render member count badge when team has no members', () => {
    render(
      <TeamStatusCard
        association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
        teammates={[]}
        onNavigate={onNavigate}
      />
    );
    expect(screen.queryByTestId('team-status-card-member-count')).not.toBeInTheDocument();
  });

  it('prefers live team name over cached association team name', () => {
    render(
      <TeamStatusCard
        association={{
          team_id: teamId,
          origin_conversation_id: 'conv-1',
          status: 'active',
          team: { id: teamId, name: 'Cached Name' } as never,
        }}
        team={mockTeam({ name: 'Live Name' })}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('team-status-card-name')).toHaveTextContent('Live Name');
  });

  describe('TeamStatusCard run state display', () => {
    it('shows a running indicator when isTeamRunning is true', () => {
      render(
        <TeamStatusCard
          association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
          team={mockTeam()}
          isTeamRunning
          onNavigate={onNavigate}
        />
      );
      expect(screen.getByTestId('team-status-card-running')).toBeInTheDocument();
    });

    it('does not show the running indicator when isTeamRunning is false', () => {
      render(
        <TeamStatusCard
          association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
          team={mockTeam()}
          isTeamRunning={false}
          onNavigate={onNavigate}
        />
      );
      expect(screen.queryByTestId('team-status-card-running')).not.toBeInTheDocument();
    });

    it('shows slot work summary with active turn count', () => {
      render(
        <TeamStatusCard
          association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
          team={mockTeam()}
          isTeamRunning
          activeRun={mockRunEvent({ status: 'running' })}
          slotWorkBySlot={{
            'slot-lead': mockSlotWork({
              slot_id: 'slot-lead',
              role: 'lead',
              state: 'running',
              active_turn_id: 'turn-1',
            }),
            'slot-a': mockSlotWork({ slot_id: 'slot-a', role: 'teammate', state: 'idle' }),
          }}
          onNavigate={onNavigate}
        />
      );
      expect(screen.getByTestId('team-status-card-run-detail')).toHaveTextContent(/1/);
    });

    it('clears run state display when the run is completed', () => {
      const { rerender } = render(
        <TeamStatusCard
          association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
          team={mockTeam()}
          isTeamRunning
          activeRun={mockRunEvent({ status: 'running' })}
          slotWorkBySlot={{
            'slot-lead': mockSlotWork({
              slot_id: 'slot-lead',
              role: 'lead',
              state: 'running',
              active_turn_id: 'turn-1',
            }),
          }}
          onNavigate={onNavigate}
        />
      );
      expect(screen.getByTestId('team-status-card-running')).toBeInTheDocument();

      rerender(
        <TeamStatusCard
          association={{ team_id: teamId, origin_conversation_id: 'conv-1', status: 'active' }}
          team={mockTeam()}
          isTeamRunning={false}
          activeRun={undefined}
          slotWorkBySlot={{}}
          onNavigate={onNavigate}
        />
      );
      expect(screen.queryByTestId('team-status-card-running')).not.toBeInTheDocument();
      expect(screen.queryByTestId('team-status-card-run-detail')).not.toBeInTheDocument();
    });
  });
});
