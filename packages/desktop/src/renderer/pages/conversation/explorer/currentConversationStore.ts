/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module-level "active conversation id" store, sibling to {@link currentProjectStore}.
 * The conversation route publishes the mounted conversation's id; the team route
 * publishes the active member column's conversation id. The Layout-level Project
 * Explorer reads it so "add to chat" can target that conversation's send box.
 *
 * Only the id is tracked — the Explorer emits the append on all agent prefixes
 * carrying this id, and each send box accepts only when the id matches its own
 * conversation (ids are unique, so the agent type need not be known here).
 *
 * `null` when there is no active conversation (non-chat route, or after leaving
 * the conversation + team routes).
 */

import { useSyncExternalStore } from 'react';

let currentConversationId: string | null = null;
const listeners = new Set<() => void>();

/** Set the active conversation id (no-ops + skips notify when unchanged). */
export const setCurrentConversation = (id: string | null): void => {
  const next = id || null;
  if (next === currentConversationId) return;
  currentConversationId = next;
  for (const listener of listeners) listener();
};

export const getCurrentConversation = (): string | null => currentConversationId;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Subscribe a React component to the active conversation id. */
export const useCurrentConversation = (): string | null =>
  useSyncExternalStore(subscribe, getCurrentConversation, getCurrentConversation);

/** Test hook: reset module state. */
export const resetCurrentConversationForTest = (): void => {
  currentConversationId = null;
  listeners.clear();
};
