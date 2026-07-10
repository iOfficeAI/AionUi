/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

/**
 * 团队协作视图模式 —— 团队整体属性，按团队记忆（localStorage）。
 * - parallel：所有成员对话列并排（默认）。
 * - single：全屏显示当前选中的成员。
 */
export type TeamViewMode = 'parallel' | 'single';

const storageKey = (team_id: string): string => `team-view-mode-${team_id}`;

const readViewMode = (team_id: string): TeamViewMode => {
  try {
    return localStorage.getItem(storageKey(team_id)) === 'single' ? 'single' : 'parallel';
  } catch {
    return 'parallel';
  }
};

export function useTeamViewMode(team_id: string): [TeamViewMode, (mode: TeamViewMode) => void] {
  const [viewMode, setViewModeState] = useState<TeamViewMode>(() => readViewMode(team_id));

  const setViewMode = useCallback(
    (mode: TeamViewMode) => {
      setViewModeState(mode);
      try {
        localStorage.setItem(storageKey(team_id), mode);
      } catch {
        // storage unavailable — 视图仍在内存生效
      }
    },
    [team_id]
  );

  return [viewMode, setViewMode];
}
