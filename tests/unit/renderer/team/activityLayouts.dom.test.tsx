/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ITeamMailboxMessage, ITeamTaskItem } from '@/common/types/team/teamTypes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));

// Stub the heavy identity component (logos/SWR/preset hooks) — this suite only
// verifies the board's header branching, not the identity internals.
vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  default: (props: { assistant_name: string }) => <span data-testid="team-agent-identity-inner">{props.assistant_name}</span>,
}));

import ActivityBoardLayout from '@/renderer/pages/team/activity/ActivityBoardLayout';
import { ACTIVITY_FALLBACK_LANE, type ActivityItem, type ActivityLane } from '@/renderer/pages/team/activity/activityTypes';
import type { ActivityIdentityResolver } from '@/renderer/pages/team/activity/MessageCard';

const identity: ActivityIdentityResolver = { nameOf: (s) => s ?? '', colorOf: () => '#123456' };

const lanes: ActivityLane[] = [
  { slotId: 'lead', name: 'Lead', color: '#111', isFallback: false, backend: 'claude' },
  { slotId: 'a1', name: 'Alice', color: '#222', isFallback: false, backend: 'codex' },
];

const message = (over: Partial<ITeamMailboxMessage> = {}): ITeamMailboxMessage => ({
  id: 'm1',
  team_id: 't1',
  from_agent_id: 'lead',
  to_agent_id: 'a1',
  msg_type: 'message',
  content: 'hello there',
  files: [],
  read: false,
  created_at: 1000,
  ...over,
});
const task = (over: Partial<ITeamTaskItem> = {}): ITeamTaskItem => ({
  id: 'tk1',
  team_id: 't1',
  subject: 'Build',
  status: 'pending',
  owner: 'a1',
  blocked_by: [],
  blocks: [],
  created_at: 2000,
  updated_at: 2000,
  ...over,
});

const items: ActivityItem[] = [
  { kind: 'message', id: 'm1', laneSlotId: 'a1', createdAt: 1000, message: message() },
  { kind: 'task', id: 'tk1', laneSlotId: 'a1', createdAt: 2000, task: task() },
];

afterEach(() => cleanup());

describe('ActivityBoardLayout', () => {
  it('renders one column per lane with its items', () => {
    render(<ActivityBoardLayout items={items} lanes={lanes} identity={identity} />);
    const columns = screen.getAllByTestId('activity-board-column');
    expect(columns).toHaveLength(2);
    // Both items belong to the a1 lane.
    expect(screen.getByTestId('activity-message-card')).toBeInTheDocument();
    expect(screen.getByTestId('activity-task-card')).toBeInTheDocument();
  });

  it('renders an assistant identity in member column headers', () => {
    render(<ActivityBoardLayout items={items} lanes={lanes} identity={identity} />);
    const header = screen.getAllByTestId('activity-board-column')[0];
    expect(within(header).getByTestId('team-agent-identity')).toBeInTheDocument();
  });

  it('keeps a neutral dot (no identity) for the fallback lane header', () => {
    const fallbackLanes: ActivityLane[] = [
      { slotId: ACTIVITY_FALLBACK_LANE, name: 'Unassigned / external', color: '#999', isFallback: true },
    ];
    const fallbackItems: ActivityItem[] = [
      { kind: 'message', id: 'm2', laneSlotId: ACTIVITY_FALLBACK_LANE, createdAt: 1, message: message({ id: 'm2', to_agent_id: 'user' }) },
    ];
    render(<ActivityBoardLayout items={fallbackItems} lanes={fallbackLanes} identity={identity} />);
    const header = screen.getAllByTestId('activity-board-column')[0];
    expect(within(header).queryByTestId('team-agent-identity')).toBeNull();
  });
});
