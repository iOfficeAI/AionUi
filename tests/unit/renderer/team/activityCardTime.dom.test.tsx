/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ITeamMailboxMessage, ITeamTaskItem } from '@/common/types/team/teamTypes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));

import MessageCard, { type ActivityIdentityResolver } from '@/renderer/pages/team/activity/MessageCard';
import TaskCard from '@/renderer/pages/team/activity/TaskCard';

const identity: ActivityIdentityResolver = { nameOf: (s) => s ?? '', colorOf: () => '#123456' };
// An earlier year renders as the full `YYYY-MM-DD HH:mm` regardless of "now".
const created = dayjs('2025-06-15T09:05:00').valueOf();

const message: ITeamMailboxMessage = {
  id: 'm1',
  team_id: 't1',
  from_agent_id: 'a1',
  to_agent_id: 'a2',
  msg_type: 'message',
  content: 'hi',
  files: [],
  read: true,
  created_at: created,
};
const task: ITeamTaskItem = {
  id: 'tk1',
  team_id: 't1',
  subject: 'Build',
  status: 'pending',
  owner: 'a1',
  blocked_by: [],
  blocks: [],
  created_at: created,
  updated_at: created + 1000,
};

afterEach(() => cleanup());

describe('activity cards show created_at', () => {
  it('MessageCard renders the formatted created_at', () => {
    render(<MessageCard message={message} identity={identity} />);
    expect(screen.getByText('2025-06-15 09:05')).toBeInTheDocument();
  });

  it('TaskCard renders the formatted created_at', () => {
    render(<TaskCard task={task} identity={identity} />);
    expect(screen.getByText('2025-06-15 09:05')).toBeInTheDocument();
  });
});
