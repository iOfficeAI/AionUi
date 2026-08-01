/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ACTIVITY_FALLBACK_LANE } from '@/renderer/pages/team/activity/activityTypes';
import { useTeamActivityControls } from '@/renderer/pages/team/hooks/useTeamActivityControls';

const KEY = 't1';
afterEach(() => localStorage.clear());

describe('useTeamActivityControls', () => {
  it('defaults when nothing stored', () => {
    const { result } = renderHook(() => useTeamActivityControls(KEY, ['a1', 'a2']));
    expect(result.current[0]).toEqual({
      sortDirection: 'desc',
      contentFilter: 'all',
      selectedMembers: [],
      showSystemMessages: false,
      showTerminalTasks: false,
    });
  });

  it('persists and reloads', () => {
    const { result, unmount } = renderHook(() => useTeamActivityControls(KEY, ['a1']));
    act(() => result.current[1]({ ...result.current[0], sortDirection: 'asc', showSystemMessages: true }));
    unmount();
    const { result: r2 } = renderHook(() => useTeamActivityControls(KEY, ['a1']));
    expect(r2.current[0].sortDirection).toBe('asc');
    expect(r2.current[0].showSystemMessages).toBe(true);
  });

  it('prunes stale members not in valid lane ids', () => {
    localStorage.setItem(
      `team-activity-controls-${KEY}`,
      JSON.stringify({
        sortDirection: 'desc',
        contentFilter: 'all',
        selectedMembers: ['a1', 'gone', ACTIVITY_FALLBACK_LANE],
        showSystemMessages: false,
        showTerminalTasks: false,
      })
    );
    const { result } = renderHook(() => useTeamActivityControls(KEY, ['a1']));
    expect(result.current[0].selectedMembers).toEqual(['a1', ACTIVITY_FALLBACK_LANE]);
  });

  it('falls back to defaults on invalid enum / corrupt json', () => {
    localStorage.setItem(`team-activity-controls-${KEY}`, '{not json');
    const { result } = renderHook(() => useTeamActivityControls(KEY, ['a1']));
    expect(result.current[0].sortDirection).toBe('desc');

    localStorage.setItem(
      `team-activity-controls-${KEY}`,
      JSON.stringify({ sortDirection: 'sideways', contentFilter: 'nope' })
    );
    const { result: r2 } = renderHook(() => useTeamActivityControls(KEY, ['a1']));
    expect(r2.current[0].sortDirection).toBe('desc');
    expect(r2.current[0].contentFilter).toBe('all');
  });
});
