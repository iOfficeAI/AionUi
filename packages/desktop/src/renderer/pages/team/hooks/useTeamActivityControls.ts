/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from 'react';
import { ACTIVITY_FALLBACK_LANE } from '../activity/activityTypes';
import type { ActivityControlsState } from '../activity/ActivityControlBar';

const DEFAULTS: ActivityControlsState = {
  sortDirection: 'desc',
  contentFilter: 'all',
  selectedMembers: [],
  showSystemMessages: false,
  showTerminalTasks: false,
};

const storageKey = (teamId: string): string => `team-activity-controls-${teamId}`;

const SORTS = new Set(['desc', 'asc']);
const FILTERS = new Set(['all', 'messages', 'tasks']);

/** Parses stored controls defensively, falling back to defaults per field. */
function parseControls(raw: string | null): ActivityControlsState {
  if (!raw) return DEFAULTS;
  try {
    const o = JSON.parse(raw) as Partial<ActivityControlsState>;
    return {
      sortDirection: SORTS.has(o.sortDirection as string)
        ? (o.sortDirection as ActivityControlsState['sortDirection'])
        : DEFAULTS.sortDirection,
      contentFilter: FILTERS.has(o.contentFilter as string)
        ? (o.contentFilter as ActivityControlsState['contentFilter'])
        : DEFAULTS.contentFilter,
      selectedMembers: Array.isArray(o.selectedMembers)
        ? o.selectedMembers.filter((m): m is string => typeof m === 'string')
        : [],
      showSystemMessages: typeof o.showSystemMessages === 'boolean' ? o.showSystemMessages : false,
      showTerminalTasks: typeof o.showTerminalTasks === 'boolean' ? o.showTerminalTasks : false,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Per-team persisted activity board controls (localStorage). Stale members no
 * longer in `validLaneIds` (member slot ids ∪ fallback lane) are pruned on read;
 * pruning to empty means "all members" (safe default). Enum/type-invalid stored
 * values fall back to defaults.
 */
export function useTeamActivityControls(
  teamId: string,
  validLaneIds: string[]
): [ActivityControlsState, (next: ActivityControlsState) => void] {
  const validSet = useMemo(() => new Set([...validLaneIds, ACTIVITY_FALLBACK_LANE]), [validLaneIds]);

  const [controls, setControlsState] = useState<ActivityControlsState>(() => {
    const parsed = parseControls(localStorage.getItem(storageKey(teamId)));
    return { ...parsed, selectedMembers: parsed.selectedMembers.filter((m) => validSet.has(m)) };
  });

  const setControls = useCallback(
    (next: ActivityControlsState) => {
      setControlsState(next);
      try {
        localStorage.setItem(storageKey(teamId), JSON.stringify(next));
      } catch {
        // storage unavailable — controls remain in memory
      }
    },
    [teamId]
  );

  return [controls, setControls];
}
