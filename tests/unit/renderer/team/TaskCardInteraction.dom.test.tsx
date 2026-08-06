/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ITeamTaskItem } from '@/common/types/team/teamTypes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown>) => {
      let s = (o?.defaultValue as string) ?? _k;
      if (o) {
        for (const [k, v] of Object.entries(o)) {
          if (k !== 'defaultValue') s = s.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
      }
      return s;
    },
  }),
}));

import TaskCard from '@/renderer/pages/team/activity/TaskCard';
import { ActivityTaskIndexProvider } from '@/renderer/pages/team/activity/ActivityTaskIndexContext';
import type { ActivityIdentityResolver } from '@/renderer/pages/team/activity/MessageCard';

const identity: ActivityIdentityResolver = { nameOf: (s) => s ?? '', colorOf: () => '#123456' };
const task: ITeamTaskItem = {
  id: 'k2',
  team_id: 't1',
  subject: 'Beta',
  status: 'pending',
  owner: undefined,
  blocked_by: ['k1'],
  blocks: [],
  created_at: 1,
  updated_at: 1,
};

afterEach(() => cleanup());

describe('TaskCard dependency interaction', () => {
  it('calls highlightTask on click when target is loaded', () => {
    const highlightTask = vi.fn(() => true);
    render(
      <ActivityTaskIndexProvider value={{ resolve: () => ({ subject: 'Alpha', status: 'completed' }), highlightTask }}>
        <TaskCard task={task} identity={identity} />
      </ActivityTaskIndexProvider>
    );
    fireEvent.click(screen.getByText(/Alpha/));
    expect(highlightTask).toHaveBeenCalledWith('k1');
  });

  it('opens popover with blocker info when target not loaded', () => {
    const highlightTask = vi.fn(() => false);
    render(
      <ActivityTaskIndexProvider
        value={{ resolve: () => ({ subject: 'Alpha', status: 'completed', owner: 'a1' }), highlightTask }}
      >
        <TaskCard task={task} identity={identity} />
      </ActivityTaskIndexProvider>
    );
    fireEvent.click(screen.getByText(/Alpha/));
    // Popover content renders the blocker subject a second time (in the panel).
    expect(screen.getAllByText(/Alpha/).length).toBeGreaterThan(1);
  });
});
