/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Absolute start timestamps (ms) of the in-flight turn, keyed by conversation id.
// Module-level so the origin survives send-box unmount when the user switches
// conversations; ThoughtDisplay derives elapsed time from this fixed origin
// instead of restarting a local timer on every remount.
const turnStartTimes = new Map<string, number>();

/**
 * Record the turn start for a conversation. Keeps an already-recorded origin
 * (re-entering a conversation mid-turn must not move the clock), so callers
 * must end the previous turn before a new origin can be recorded.
 */
export const beginConversationTurn = (conversationId: string, at: number = Date.now()): number => {
  const existing = turnStartTimes.get(conversationId);
  if (existing !== undefined) {
    return existing;
  }
  turnStartTimes.set(conversationId, at);
  return at;
};

export const endConversationTurn = (conversationId: string): void => {
  turnStartTimes.delete(conversationId);
};

export const getConversationTurnStart = (conversationId: string): number | null => {
  return turnStartTimes.get(conversationId) ?? null;
};

export const resetConversationTurnClockForTests = (): void => {
  turnStartTimes.clear();
};
