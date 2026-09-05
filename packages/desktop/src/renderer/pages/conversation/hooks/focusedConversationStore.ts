/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The one "which conversation is the user working in" store.
 *
 * The app used to keep two module singletons — one active conversation id and
 * one active project id — each written straight from the route. That holds only
 * while exactly one conversation view is on screen: a second mounted
 * `<ChatConversation>` would overwrite the first one's id and steal the
 * Explorer's "add to chat" target, the project panel and the preview scope.
 *
 * This store keeps the same `useSyncExternalStore` shape and adds the missing
 * piece: the set of conversation views currently mounted.
 *
 * Focus is **derived, never stored**. Two facts go in — the conversation a
 * caller last named, and which views are mounted — and the answer is computed
 * on read:
 *
 * 1. The named conversation, if its view is on screen. That is the column the
 *    user last clicked, and the route's own publish.
 * 2. Otherwise the view that has been on screen longest. One mounted
 *    conversation is therefore always the focused one, which is the
 *    single-conversation app exactly as it behaves today, and opening a second
 *    column does not move the focus off the first — only a click does.
 * 3. Otherwise the name as it stands: with nothing on screen there is nothing
 *    to fall back to, and clearing the name is the caller's explicit job
 *    (`Layout.tsx` does it on leaving the chat routes).
 *
 * Deriving is what makes this correct without timing assumptions. Naming a
 * column and then mounting the columns settles on the named one whenever it
 * arrives — same commit, next commit, or seconds later — because the answer is
 * recomputed rather than latched. An earlier revision latched a "pending" focus
 * and needed a timer to release it, which could strand the focus on a view that
 * never mounted and refuse the one that mounted a tick too late.
 *
 * The project id is published explicitly by the routes that know it
 * (conversation + team) rather than derived from the focused conversation:
 * a conversation's `project_id` arrives asynchronously, and the Explorer column
 * must not flicker while it does.
 */

import { useEffect, useSyncExternalStore } from 'react';

/** The conversation a caller last named. One of the two inputs to the focus. */
let namedConversationId: string | null = null;

let focusedProjectId: string | null = null;

/**
 * Mount refcount per conversation id, in mount order. A conversation can be
 * mounted more than once (two columns showing the same conversation), so an
 * unmount must not drop it while another instance is still on screen.
 */
const mountCounts = new Map<string, number>();

/** Cached snapshot for `useSyncExternalStore` — replaced only when it changes. */
let mountedIds: readonly string[] = [];

const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Re-derive the mounted-id snapshot after a mount-count change. */
const refreshMountedIds = (): void => {
  mountedIds = Array.from(mountCounts.keys());
};

// ---------------------------------------------------------------------------
// Mounted conversation views
// ---------------------------------------------------------------------------

/**
 * Announce that a conversation view is on screen. Returns the matching
 * unregister so callers can use it directly as an effect cleanup.
 */
export const registerMountedConversation = (conversation_id: string): (() => void) => {
  if (!conversation_id) return () => {};

  mountCounts.set(conversation_id, (mountCounts.get(conversation_id) ?? 0) + 1);
  refreshMountedIds();
  notify();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    unregisterMountedConversation(conversation_id);
  };
};

/** Announce that a conversation view left the screen. */
export const unregisterMountedConversation = (conversation_id: string): void => {
  const count = mountCounts.get(conversation_id);
  if (count === undefined) return;

  if (count > 1) {
    mountCounts.set(conversation_id, count - 1);
  } else {
    mountCounts.delete(conversation_id);
  }
  refreshMountedIds();
  notify();
};

/**
 * Conversation ids whose view is mounted right now, in mount order.
 *
 * Not to be confused with `GroupedHistory/hooks/useVisibleConversationIds`,
 * which reports the rows visible in the sidebar list.
 */
export const getMountedConversationIds = (): readonly string[] => mountedIds;

export const isConversationMounted = (conversation_id: string): boolean => mountCounts.has(conversation_id);

/** Subscribe a React component to the mounted conversation ids. */
export const useMountedConversationIds = (): readonly string[] =>
  useSyncExternalStore(subscribe, getMountedConversationIds, getMountedConversationIds);

// ---------------------------------------------------------------------------
// Focused conversation
// ---------------------------------------------------------------------------

/**
 * Focus a conversation explicitly: the route publishing the conversation it
 * mounted, the team route publishing its active member column, or a pointer /
 * focus event inside a conversation's subtree. `''` and `null` both clear it.
 */
export const setFocusedConversation = (conversation_id: string | null): void => {
  const next = conversation_id || null;
  if (next === namedConversationId) return;
  namedConversationId = next;
  notify();
};

/**
 * The conversation the user is working in, derived from the name and the
 * mounted set on every read — see the rules at the top of this file.
 */
export const getFocusedConversation = (): string | null => {
  if (namedConversationId !== null && mountCounts.has(namedConversationId)) return namedConversationId;
  if (mountedIds.length > 0) return mountedIds[0];
  return namedConversationId;
};

/**
 * Address an announcement (`sendbox.fill`, `sendbox.reply`, `preview.open`, …)
 * to a conversation. An emitter that knows its own conversation passes it; one
 * that does not — a control rendered outside a conversation subtree — falls back
 * to the focused conversation rather than shouting at every mounted view.
 * `undefined` means "no conversation to address", which consumers treat as a
 * broadcast for back-compat.
 */
export const resolveAnnouncementTarget = (conversation_id: string | undefined): string | undefined =>
  conversation_id ?? getFocusedConversation() ?? undefined;

/** Subscribe a React component to the focused conversation id. */
export const useFocusedConversationId = (): string | null =>
  useSyncExternalStore(subscribe, getFocusedConversation, getFocusedConversation);

// ---------------------------------------------------------------------------
// Focused project
// ---------------------------------------------------------------------------

/** Publish the project the focused conversation belongs to (`null` = none). */
export const setFocusedProject = (project_id: string | null): void => {
  if (project_id === focusedProjectId) return;
  focusedProjectId = project_id;
  notify();
};

export const getFocusedProject = (): string | null => focusedProjectId;

export const subscribeFocusedProject = subscribe;

/** Subscribe a React component to the focused project id. */
export const useFocusedProjectId = (): string | null =>
  useSyncExternalStore(subscribe, getFocusedProject, getFocusedProject);

// ---------------------------------------------------------------------------
// React helpers
// ---------------------------------------------------------------------------

/**
 * Register a mounted conversation view for the lifetime of the component, and
 * return the handlers its root element must carry so that interacting with it
 * focuses it. Capture phase on purpose: a click deep inside the subtree (a
 * message, the send box) must move focus even when the handler that receives it
 * stops propagation.
 *
 * Mirrors the team route's `activeSlotId` + `isActive` / `onFocus` pattern
 * (pages/team/hooks/TeamTabsContext.tsx), applied to a whole conversation view
 * instead of a single send box.
 */
export const useFocusedConversationRegistration = (
  conversation_id: string | undefined
): {
  onPointerDownCapture: () => void;
  onFocusCapture: () => void;
} => {
  useEffect(() => {
    if (!conversation_id) return;
    return registerMountedConversation(conversation_id);
  }, [conversation_id]);

  return {
    onPointerDownCapture: () => setFocusedConversation(conversation_id ?? null),
    onFocusCapture: () => setFocusedConversation(conversation_id ?? null),
  };
};

/** Test hook: reset module state. */
export const resetFocusedConversationStoreForTest = (): void => {
  namedConversationId = null;
  focusedProjectId = null;
  mountCounts.clear();
  mountedIds = [];
  listeners.clear();
};
