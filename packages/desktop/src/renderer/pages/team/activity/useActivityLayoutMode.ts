/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

/**
 * Sub-layout of the activity view — per team, remembered in localStorage.
 * - swimlane：成员泳道 + 时间线（默认）。
 * - board：成员分列看板。
 */
export type ActivityLayoutMode = 'swimlane' | 'board';

const storageKey = (team_id: string): string => `team-activity-layout-${team_id}`;

const readLayoutMode = (team_id: string): ActivityLayoutMode => {
  try {
    return localStorage.getItem(storageKey(team_id)) === 'board' ? 'board' : 'swimlane';
  } catch {
    return 'swimlane';
  }
};

export function useActivityLayoutMode(team_id: string): [ActivityLayoutMode, (mode: ActivityLayoutMode) => void] {
  const [layoutMode, setLayoutModeState] = useState<ActivityLayoutMode>(() => readLayoutMode(team_id));

  const setLayoutMode = useCallback(
    (mode: ActivityLayoutMode) => {
      setLayoutModeState(mode);
      try {
        localStorage.setItem(storageKey(team_id), mode);
      } catch {
        // storage unavailable — 布局仍在内存生效
      }
    },
    [team_id]
  );

  return [layoutMode, setLayoutMode];
}
