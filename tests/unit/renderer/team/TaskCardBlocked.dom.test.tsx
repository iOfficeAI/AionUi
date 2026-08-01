/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ITeamTaskItem } from '@/common/types/team/teamTypes';

// Interpolating i18n stub: fills {{name}}/{{id}} so labels are assertable.
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
import {
  ActivityTaskIndexProvider,
  type ActivityTaskIndex,
} from '@/renderer/pages/team/activity/ActivityTaskIndexContext';
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

const renderWith = (resolve: ActivityTaskIndex['resolve']) =>
  render(
    <ActivityTaskIndexProvider value={{ resolve, highlightTask: () => false }}>
      <TaskCard task={task} identity={identity} />
    </ActivityTaskIndexProvider>
  );

afterEach(() => cleanup());

describe('TaskCard blocked_by label', () => {
  it('shows resolved subject, not the id prefix', () => {
    renderWith((id) => (id === 'k1' ? { subject: 'Alpha', status: 'completed' } : undefined));
    expect(screen.getByText(/Alpha/)).toBeInTheDocument();
    expect(screen.queryByText(/k1/)).not.toBeInTheDocument();
  });

  it('falls back to short id when unresolved', () => {
    renderWith(() => undefined);
    expect(screen.getByText(/k1/)).toBeInTheDocument();
  });

  it('exposes the full label via title so long names are not lost when truncated', () => {
    const long = 'Delete team/poems files (小码) and confirm nothing else changed under the directory';
    renderWith((id) => (id === 'k1' ? { subject: long, status: 'completed' } : undefined));
    const labelEl = screen.getByText(new RegExp('Delete team/poems files'));
    expect(labelEl).toHaveAttribute('title');
    expect(labelEl.className).toContain('truncate');
  });
});
