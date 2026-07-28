/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module-level "current project" store (stage3 FULL). The conversation route
 * publishes the active conversation's `project_id` here; the Layout-level
 * Project Explorer column subscribes. Because it lives above the
 * conversation-keyed route subtree, switching conversations within the same
 * project leaves the value unchanged — the explorer column does not remount.
 *
 * `null` when there is no project (no-project conversation, or a non-chat route).
 */

import { useSyncExternalStore } from 'react';

let currentProjectId: string | null = null;
const listeners = new Set<() => void>();

/** Set the active project id (no-ops + skips notify when unchanged). */
export const setCurrentProject = (id: string | null): void => {
  if (id === currentProjectId) return;
  currentProjectId = id;
  for (const listener of listeners) listener();
};

export const getCurrentProject = (): string | null => currentProjectId;

export const subscribeCurrentProject = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Subscribe a React component to the current project id. */
export const useCurrentProject = (): string | null =>
  useSyncExternalStore(subscribeCurrentProject, getCurrentProject, getCurrentProject);

/** Test hook: reset module state. */
export const resetCurrentProjectForTest = (): void => {
  currentProjectId = null;
  listeners.clear();
};
