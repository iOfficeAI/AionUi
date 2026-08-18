/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';

export type SideConversationEligibilityTarget = {
  type: TChatConversation['type'];
  /** From the conversation DETAIL response — present = the backend supports
   * session fork (claude / codex / Aion CLI …), absent = no side threads. */
  fork_capability?: { at_turn: boolean };
};

/**
 * Whether a conversation can host a forked side thread. Capability-driven off
 * the backend-reported `fork_capability`, so newly enabled backends (e.g. the
 * Aion CLI fork support) are picked up without renderer changes. Team rows and
 * legacy read-only types never report the capability and stay excluded.
 */
export function isSideConversationSupported(target: SideConversationEligibilityTarget): boolean {
  return Boolean(target.fork_capability);
}

/** Hide ephemeral side threads from the session history list. */
export function isEphemeralSideConversation(conversation: Pick<TChatConversation, 'extra'>): boolean {
  return Boolean(conversation.extra?.side_mode && conversation.extra?.ephemeral);
}

/** Whether a conversation row is a side child of the given parent. */
export function isSideChildOf(conversation: Pick<TChatConversation, 'extra'>, parentId: string): boolean {
  return Boolean(conversation.extra?.side_mode && conversation.extra?.parent_conversation_id === parentId);
}
