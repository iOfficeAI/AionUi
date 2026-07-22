/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';

/**
 * Module-level cache of workspace tree state, keyed by the workspace path
 * (the project directory). It lets the tree survive events that would
 * otherwise wipe it:
 *
 *  1. Switching between conversations that share the same project directory —
 *     the sidebar groups conversations by workspace, so all conversations in a
 *     group point at the same path and should show the same tree.
 *  2. The brief unmount/remount of the workspace panel that happens when
 *     routing to a not-yet-cached conversation (the page shows a Spin while
 *     SWR loads, which unmounts ChatWorkspace and loses its React state).
 *
 * Because the key is the project directory (not the conversation id), two
 * different projects never share state, and returning to a project restores
 * exactly what the user had expanded — including files that appeared while the
 * panel was unmounted.
 */

export interface WorkspaceTreeSnapshot {
  files: IDirOrFile[];
  expandedKeys: string[];
}

const cache = new Map<string, WorkspaceTreeSnapshot>();

// Cap the cache so long sessions across many projects don't grow unbounded.
// The most-recently-used workspace is re-inserted on every write, so eviction
// drops the least-recently-touched project first.
const MAX_ENTRIES = 20;

export function getWorkspaceTreeSnapshot(workspace: string): WorkspaceTreeSnapshot | undefined {
  if (!workspace) return undefined;
  return cache.get(workspace);
}

export function setWorkspaceTreeSnapshot(workspace: string, snapshot: WorkspaceTreeSnapshot): void {
  if (!workspace) return;
  // Re-insert to mark as most-recently-used.
  cache.delete(workspace);
  cache.set(workspace, snapshot);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Test-only: clear all cached snapshots. */
export function __clearWorkspaceTreeCache(): void {
  cache.clear();
}
