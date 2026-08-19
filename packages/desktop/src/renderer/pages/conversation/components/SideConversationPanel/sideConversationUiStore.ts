/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module-level store carrying the active conversation's side-conversation UI
 * state, sibling to `explorer/currentConversationStore`.
 *
 * The side state machine (`useSideConversation`) lives in the per-conversation
 * ChatConversation subtree, but the side tab itself renders inside
 * ExplorerContainer, which for project conversations is hosted at the Layout
 * level (ProjectPanelHost) — a different subtree no React context can reach.
 * The wiring publishes a snapshot here; ExplorerContainer subscribes and
 * renders the tab (badge + dropdown) plus the panel content node.
 *
 * `null` when the active conversation does not support side conversations (or
 * no conversation is mounted) — ExplorerContainer hides the side tab then.
 */

import type { SideConversationMode } from '@/common/chat/sideConversation';
import React, { useSyncExternalStore } from 'react';

export type SideUiThread = {
  id: string;
  /** First question when known; the UI falls back to a numbered tab label. */
  label?: string;
  mode: SideConversationMode;
  /** Session-scoped: this thread was promoted to a normal conversation. */
  promoted: boolean;
};

export type SideConversationUiSnapshot = {
  /** Owning parent conversation id — consumers match it against the active conversation. */
  parentId: string;
  threads: SideUiThread[];
  activeThreadId?: string;
  /** Pre-built panel content node (pure chat view, no header/tab chrome). */
  content: React.ReactNode;
  selectTab: (id: string) => void;
  discardTab: (id: string) => void;
  openNewTab: () => void;
  /** Promote the CURRENT active thread to a normal conversation. */
  promoteCurrent: () => void;
};

let snapshot: SideConversationUiSnapshot | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

/** Publish the active conversation's side UI snapshot (no-ops when unchanged). */
export const setSideConversationUi = (next: SideConversationUiSnapshot | null): void => {
  if (next === snapshot) return;
  snapshot = next;
  notify();
};

export const getSideConversationUi = (): SideConversationUiSnapshot | null => snapshot;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Subscribe a React component to the active side-conversation UI snapshot. */
export const useSideConversationUi = (): SideConversationUiSnapshot | null =>
  useSyncExternalStore(subscribe, getSideConversationUi, getSideConversationUi);

/** Test hook: reset module state. */
export const resetSideConversationUiForTest = (): void => {
  snapshot = null;
  listeners.clear();
};
