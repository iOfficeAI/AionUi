/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module-level state for tracking user-initiated messages pending notification.
 * SendBox components register messages here when users send them.
 * The centralized notification hook reads from here to decide whether to notify.
 * Cron-triggered messages bypass SendBox, so they won't be registered here.
 *
 * Entries auto-expire after TTL_MS to prevent memory leaks when notifications
 * are skipped (e.g. disabled by user, conversation deleted).
 */

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — agent tasks can run for a long time

type PendingEntry = { message: string; timestamp: number };

const pendingUserMessages = new Map<string, PendingEntry>();

/** Evict stale entries older than TTL */
const evictStale = () => {
  const now = Date.now();
  for (const [id, entry] of pendingUserMessages) {
    if (now - entry.timestamp > TTL_MS) {
      pendingUserMessages.delete(id);
    }
  }
};

/** Called by SendBox when user sends a message */
export const setPendingUserMessage = (conversationId: string, message: string) => {
  pendingUserMessages.set(conversationId, { message, timestamp: Date.now() });
  // Piggyback eviction on write to keep map bounded
  if (pendingUserMessages.size > 20) evictStale();
};

/** Called by centralized notification hook to get the pending message */
export const getPendingUserMessage = (conversationId: string): string | undefined => {
  const entry = pendingUserMessages.get(conversationId);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > TTL_MS) {
    pendingUserMessages.delete(conversationId);
    return undefined;
  }
  return entry.message;
};

/** Called after notification is shown */
export const clearPendingUserMessage = (conversationId: string) => {
  pendingUserMessages.delete(conversationId);
};
