/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds the `GET /api/teams/{id}/tasks` path. When `ids` is non-empty the
 * request resolves exactly those tasks (dependency-label resolution); otherwise
 * it returns the newest `limit` tasks (default 500). Kept in its own module so
 * the URL logic is unit-testable without importing the full ipc bridge.
 */
export function buildListTasksPath(p: { team_id: string; limit?: number; ids?: string[] }): string {
  if (p.ids && p.ids.length > 0) {
    return `/api/teams/${p.team_id}/tasks?ids=${encodeURIComponent(p.ids.join(','))}`;
  }
  return `/api/teams/${p.team_id}/tasks?limit=${p.limit ?? 500}`;
}
