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
 */

const pendingUserMessages = new Map<string, string>();

/** Called by SendBox when user sends a message */
export const setPendingUserMessage = (conversationId: string, message: string) => {
  pendingUserMessages.set(conversationId, message);
};

/** Called by centralized notification hook to get the pending message */
export const getPendingUserMessage = (conversationId: string): string | undefined => {
  return pendingUserMessages.get(conversationId);
};

/** Called after notification is shown */
export const clearPendingUserMessage = (conversationId: string) => {
  pendingUserMessages.delete(conversationId);
};
