/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** All per-team localStorage key prefixes (each stored as `${prefix}${team_id}`). */
export const TEAM_STORAGE_PREFIXES = [
  'team-view-mode-',
  'team-member-colors-',
  'team-active-slot-',
  'team-assistant-order-',
  'team-pending-permissions-',
  'team-activity-controls-',
] as const;

/**
 * Removes per-team localStorage entries whose team id is not in
 * `existingTeamIds`. Covers both frontend deletion and backend/MCP deletion
 * (WS `team.removed`) paths, and cleans up historically-leaked keys.
 */
export function pruneOrphanTeamStorage(existingTeamIds: string[]): void {
  const alive = new Set(existingTeamIds);
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const prefix = TEAM_STORAGE_PREFIXES.find((p) => key.startsWith(p));
      if (!prefix) continue;
      const teamId = key.slice(prefix.length);
      if (!alive.has(teamId)) toRemove.push(key);
    }
  } catch {
    return; // storage unavailable
  }
  for (const key of toRemove) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
