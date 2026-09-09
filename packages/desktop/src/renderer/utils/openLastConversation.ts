/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** localStorage key for the most recently opened conversation id. */
export const LAST_CONVERSATION_ID_KEY = 'aion:last-conversation-id';

/** sessionStorage flag so we only auto-restore once per app session. */
export const LAUNCH_RESTORE_DONE_KEY = 'aion:launch-restore-done';

/**
 * Pure launch-route helper: whether cold start should open last conversation.
 *
 * Rules:
 * 1. Setting off → fallback (GUID).
 * 2. Missing / empty stored id → fallback.
 * 3. Conversation no longer exists → fallback (caller should clear storage).
 * 4. Otherwise → `/conversation/:id`.
 */
export function resolveLaunchConversationRoute(options: {
  openLastConversation: boolean;
  lastConversationId: string | null | undefined;
  conversationExists: boolean;
  fallbackPath?: string;
}): string {
  const fallback = options.fallbackPath ?? '/guid';
  const id = options.lastConversationId?.trim();
  if (!options.openLastConversation || !id || !options.conversationExists) {
    return fallback;
  }
  return `/conversation/${id}`;
}

/** Extract conversation id from a React Router pathname (`/conversation/:id`). */
export function extractConversationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/conversation\/([^/?#]+)/);
  const id = match?.[1]?.trim();
  return id || null;
}

export function readLastConversationId(storage: Storage = localStorage): string | null {
  try {
    const value = storage.getItem(LAST_CONVERSATION_ID_KEY);
    const trimmed = value?.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export function writeLastConversationId(id: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(LAST_CONVERSATION_ID_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}

export function clearLastConversationId(storage: Storage = localStorage): void {
  try {
    storage.removeItem(LAST_CONVERSATION_ID_KEY);
  } catch {
    // ignore
  }
}

export function markLaunchRestoreDone(storage: Storage = sessionStorage): void {
  try {
    storage.setItem(LAUNCH_RESTORE_DONE_KEY, '1');
  } catch {
    // ignore
  }
}

export function isLaunchRestoreDone(storage: Storage = sessionStorage): boolean {
  try {
    return storage.getItem(LAUNCH_RESTORE_DONE_KEY) === '1';
  } catch {
    return false;
  }
}
