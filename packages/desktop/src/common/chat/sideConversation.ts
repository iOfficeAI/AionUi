/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';

export type SideConversationEligibilityTarget = {
  type: TChatConversation['type'];
  /** From the conversation DETAIL response — present = the backend supports
   * session fork (claude / codex / Aion CLI …). */
  fork_capability?: { at_turn: boolean };
};

export type SideConversationMode = 'fork' | 'snapshot';

/**
 * Resolve how side threads are created for a conversation:
 *
 * - `fork` — the backend reports `fork_capability`, so side children are real
 *   session forks through the native fork API (claude / codex / Aion CLI …).
 * - `snapshot` — fork-incapable but chatty agent types (any acp-family
 *   backend, e.g. hermes / pi): the child is a clone of the parent carrying a
 *   one-time read-only transcript reference, mirroring the session fork as
 *   closely as a pure-desktop path can.
 * - `null` — no side threads: legacy read-only types (gemini / openclaw /
 *   nanobot / remote) can neither fork nor send.
 */
export function resolveSideConversationMode(target: SideConversationEligibilityTarget): SideConversationMode | null {
  if (target.fork_capability) return 'fork';
  if (target.type === 'acp' || target.type === 'antigravity' || target.type === 'aionrs') return 'snapshot';
  return null;
}

/**
 * Whether a conversation can host a side thread (either mode). Fork-capable
 * backends are picked up automatically from the reported capability; the
 * snapshot fallback keeps fork-incapable ACP agents covered.
 */
export function isSideConversationSupported(target: SideConversationEligibilityTarget): boolean {
  return resolveSideConversationMode(target) !== null;
}

/** Hide ephemeral side threads from the session history list. */
export function isEphemeralSideConversation(conversation: Pick<TChatConversation, 'extra'>): boolean {
  return Boolean(conversation.extra?.side_mode && conversation.extra?.ephemeral);
}

/** Whether a conversation row is a side child of the given parent. */
export function isSideChildOf(conversation: Pick<TChatConversation, 'extra'>, parentId: string): boolean {
  return Boolean(conversation.extra?.side_mode && conversation.extra?.parent_conversation_id === parentId);
}
