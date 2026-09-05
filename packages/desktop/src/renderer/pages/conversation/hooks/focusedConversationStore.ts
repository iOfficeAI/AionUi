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
 * piece: the set of conversation views currently mounted. Focus rules, in order:
 *
 * 1. An explicit focus wins. A caller that names a conversation — the route, the
 *    team route, or a pointer event inside a view — keeps it, including while
 *    that view is still mounting. Without this, focusing a column and then
 *    letting the columns mount would hand focus to whichever mounted first.
 * 2. Otherwise, exactly one conversation mounted → it is the focused one. This
 *    is the single-conversation app as it behaves today, unchanged.
 * 3. Several mounted and no explicit focus pending → focus moves on user
 *    interaction inside a conversation's subtree (see
 *    `useFocusedConversationRegistration`), never implicitly.
 * 4. The focused conversation unmounts → focus falls to the most recently
 *    mounted survivor, or to `null` when none is left, so a stale target can
 *    never leak to a conversation the user is no longer looking at.
 *
 * The project id is published explicitly by the routes that know it
 * (conversation + team) rather than derived from the focused conversation:
 * a conversation's `project_id` arrives asynchronously, and the Explorer column
 * must not flicker while it does.
 */

import { useEffect, useSyncExternalStore } from 'react';

let focusedConversationId: string | null = null;
let focusedProjectId: string | null = null;

/**
 * True while `focusedConversationId` was named explicitly and that view has not
 * mounted yet. Mount bookkeeping leaves a pending focus alone, so
 * `setFocusedConversation('b')` followed by `a` and `b` mounting still ends on
 * `b`. Cleared the moment the named view mounts, or the focus is replaced.
 */
let focusPending = false;

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

/**
 * Re-apply the focus rules after the mounted set changed. Never runs on a plain
 * `setFocusedConversation` — that is the explicit path, and it wins.
 */
const reconcileFocus = (): void => {
  // The focused view is on screen: it is the answer, and no longer pending.
  if (focusedConversationId !== null && mountCounts.has(focusedConversationId)) {
    focusPending = false;
    return;
  }
  // Someone named a conversation whose view has not mounted yet. Hold it: the
  // columns of a split group mount one at a time, and the first one through
  // must not steal a focus the caller already decided.
  if (focusPending) return;

  if (mountedIds.length === 0) {
    focusedConversationId = null;
    return;
  }
  focusedConversationId = mountedIds[mountedIds.length - 1];
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
  reconcileFocus();
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
  reconcileFocus();
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
  if (next === focusedConversationId) return;
  focusedConversationId = next;
  // A named conversation whose view has not mounted yet is pending; clearing
  // the focus, or naming one already on screen, is not.
  focusPending = next !== null && !mountCounts.has(next);
  notify();
};

export const getFocusedConversation = (): string | null => focusedConversationId;

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
  focusedConversationId = null;
  focusedProjectId = null;
  focusPending = false;
  mountCounts.clear();
  mountedIds = [];
  listeners.clear();
};
