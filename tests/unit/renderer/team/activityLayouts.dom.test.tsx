/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ITeamMailboxMessage, ITeamTaskItem } from '@/common/types/team/teamTypes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));

import ActivitySwimlaneLayout from '@/renderer/pages/team/activity/ActivitySwimlaneLayout';
import ActivityBoardLayout from '@/renderer/pages/team/activity/ActivityBoardLayout';
import type { ActivityItem, ActivityLane } from '@/renderer/pages/team/activity/activityTypes';
import type { ActivityIdentityResolver } from '@/renderer/pages/team/activity/MessageCard';

const identity: ActivityIdentityResolver = { nameOf: (s) => s ?? '', colorOf: () => '#123456' };

const lanes: ActivityLane[] = [
  { slotId: 'lead', name: 'Lead', color: '#111', isFallback: false },
  { slotId: 'a1', name: 'Alice', color: '#222', isFallback: false },
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

describe('ActivitySwimlaneLayout', () => {
  it('renders lanes, cards, and the connector overlay when enabled', () => {
    render(<ActivitySwimlaneLayout items={items} lanes={lanes} identity={identity} showConnectors />);
    expect(screen.getByTestId('activity-swimlane')).toBeInTheDocument();
    expect(screen.getByTestId('activity-message-card')).toBeInTheDocument();
    expect(screen.getByTestId('activity-task-card')).toBeInTheDocument();
    // A message from 'lead' to 'a1' spans two lanes -> a connector is drawn.
    expect(screen.getByTestId('activity-connectors-svg')).toBeInTheDocument();
  });

  it('omits the connector overlay when disabled', () => {
    render(<ActivitySwimlaneLayout items={items} lanes={lanes} identity={identity} showConnectors={false} />);
    expect(screen.queryByTestId('activity-connectors-svg')).toBeNull();
  });
});

describe('ActivityBoardLayout', () => {
  it('renders one column per lane with its items', () => {
    render(<ActivityBoardLayout items={items} lanes={lanes} identity={identity} />);
    const columns = screen.getAllByTestId('activity-board-column');
    expect(columns).toHaveLength(2);
    // Both items belong to the a1 lane.
    expect(screen.getByTestId('activity-message-card')).toBeInTheDocument();
    expect(screen.getByTestId('activity-task-card')).toBeInTheDocument();
  });
});
