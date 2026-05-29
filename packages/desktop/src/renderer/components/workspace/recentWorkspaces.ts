/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_RECENT_WS_KEY = 'aionui:recent-workspaces';
const MAX_RECENT_WORKSPACES = 5;

export const getRecentWorkspaces = (storageKey: string = DEFAULT_RECENT_WS_KEY): string[] => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  } catch {
    return [];
  }
};

export const addRecentWorkspace = (path: string, storageKey: string = DEFAULT_RECENT_WS_KEY): void => {
  try {
    const prev = getRecentWorkspaces(storageKey);
    const next = [path, ...prev.filter((item) => item !== path)].slice(0, MAX_RECENT_WORKSPACES);
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
};

export const removeRecentWorkspace = (path: string, storageKey: string = DEFAULT_RECENT_WS_KEY): void => {
  try {
    const prev = getRecentWorkspaces(storageKey);
    const next = prev.filter((item) => item !== path);
    if (next.length === prev.length) return;
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
};

/**
 * Verify each cached recent-workspace path against the file-system browse API,
 * drop the ones that no longer exist, and persist the survivors back to
 * localStorage. Returns the surviving list (or the original list if no entries
 * needed to be pruned, so callers can short-circuit useState updates).
 *
 * Why: the "recent workspaces" list is a fire-and-forget cache that grows by
 * `addRecentWorkspace` but never shrinks. When a workspace directory is removed
 * out-of-band (in-app project deletion, `rm -rf`, container redeploy, ...) the
 * UI keeps showing it as a clickable option until the user picks it and hits an
 * error. This helper closes that gap by lazily validating entries on mount.
 *
 * Behavior:
 *  - 200 from `/api/fs/browse?path=...` → path exists, keep it.
 *  - any other HTTP status → path is gone, drop it.
 *  - network/transport error for a single path → keep it (conservative: never
 *    delete on transient failures so a flaky network doesn't wipe valid
 *    history).
 *
 * The helper is idempotent and safe to call multiple times; callers typically
 * call it once on mount of the picker UI.
 */
export const pruneRecentWorkspaces = async (
  baseUrl: string,
  storageKey: string = DEFAULT_RECENT_WS_KEY
): Promise<string[]> => {
  const list = getRecentWorkspaces(storageKey);
  if (list.length === 0) return list;

  const results = await Promise.all(
    list.map(async (path) => {
      try {
        const res = await fetch(`${baseUrl}/api/fs/browse?path=${encodeURIComponent(path)}&showFiles=false`, {
          method: 'GET',
          credentials: 'include',
        });
        return { path, exists: res.ok };
      } catch {
        // Transport-level failure: assume the path is still valid and try again
        // next time. Better to occasionally show a stale entry than to wipe the
        // user's history because the backend hiccuped.
        return { path, exists: true };
      }
    })
  );

  const survivors = results.filter((r) => r.exists).map((r) => r.path);
  if (survivors.length === list.length) return list;

  try {
    localStorage.setItem(storageKey, JSON.stringify(survivors));
  } catch {}
  return survivors;
};
