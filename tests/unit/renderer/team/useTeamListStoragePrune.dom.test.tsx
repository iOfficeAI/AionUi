/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useTeamList } from '@/renderer/pages/team/hooks/useTeamList';

const { eventChannel } = vi.hoisted(() => ({ eventChannel: { on: vi.fn(() => () => {}) } }));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: { removeJob: { invoke: vi.fn() } },
    team: {
      list: { invoke: vi.fn() },
      remove: { invoke: vi.fn() },
      listChanged: eventChannel,
      created: eventChannel,
      removed: eventChannel,
      renamed: eventChannel,
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

import { ipcBridge } from '@/common';

describe('useTeamList per-team storage pruning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(ipcBridge.team.list.invoke).mockResolvedValue([team()]);
  });

  it('does not wipe persisted keys before the team list has loaded, but prunes orphans after', async () => {
    // Existing team's persisted controls + an orphan team's key.
    localStorage.setItem('team-activity-controls-team-1', '{"sortDirection":"asc"}');
    localStorage.setItem('team-view-mode-team-1', 'board');
    localStorage.setItem('team-activity-controls-ghost', '{}');

    const { result } = renderHook(() => useTeamList(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.teams).toHaveLength(1));

    // Existing team's prefs survive the initial undefined -> loaded transition.
    expect(localStorage.getItem('team-activity-controls-team-1')).toBe('{"sortDirection":"asc"}');
    expect(localStorage.getItem('team-view-mode-team-1')).toBe('board');
    // Orphan (no such team) is cleaned up once the list is actually known.
    expect(localStorage.getItem('team-activity-controls-ghost')).toBeNull();
  });
});

function swrWrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>;
}

function team(): TTeam {
  return {
    id: 'team-1',
    user_id: 'user-1',
    name: 'Team',
    workspace: '/tmp/team',
    workspace_mode: 'shared',
    created_at: 1,
    updated_at: 1,
    assistants: [],
  } as TTeam;
}
