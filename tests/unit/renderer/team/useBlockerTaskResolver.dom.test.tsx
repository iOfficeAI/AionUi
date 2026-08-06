/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ITeamTaskItem } from '@/common/types/team/teamTypes';

const { invoke, taskChangedOn } = vi.hoisted(() => ({
  invoke: vi.fn(),
  taskChangedOn: vi.fn(() => () => {}),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      listTasks: { invoke },
      taskChanged: { on: taskChangedOn },
    },
  },
}));

import { useBlockerTaskResolver } from '@/renderer/pages/team/activity/useBlockerTaskResolver';

const task = (id: string, subject: string, blocked_by: string[] = []): ITeamTaskItem => ({
  id,
  team_id: 't1',
  subject,
  status: 'pending',
  owner: undefined,
  blocked_by,
  blocks: [],
  created_at: 1,
  updated_at: 1,
});

afterEach(() => vi.clearAllMocks());

describe('useBlockerTaskResolver', () => {
  it('resolves from loaded tasks without fetching', async () => {
    const loaded = [task('k1', 'Alpha'), task('k2', 'Beta', ['k1'])];
    const { result } = renderHook(() => useBlockerTaskResolver('t1', loaded));
    await waitFor(() => expect(result.current('k1')?.subject).toBe('Alpha'));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('fetches unresolved blocker ids in one batch', async () => {
    invoke.mockResolvedValue([task('k9', 'Offscreen')]);
    // k2 references k9, which is NOT in loaded tasks.
    const loaded = [task('k2', 'Beta', ['k9'])];
    const { result } = renderHook(() => useBlockerTaskResolver('t1', loaded));
    await waitFor(() => expect(result.current('k9')?.subject).toBe('Offscreen'));
    expect(invoke).toHaveBeenCalledWith({ team_id: 't1', ids: ['k9'] });
  });

  it('returns undefined for still-unknown ids', () => {
    const { result } = renderHook(() => useBlockerTaskResolver('t1', []));
    expect(result.current('ghost')).toBeUndefined();
  });
});
