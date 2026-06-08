/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';

export type SideConversationEligibilityTarget = {
  type: TChatConversation['type'];
  backend?: string;
};

/** ACP backends that use real `session/fork` (path A). Must match aioncore `acp_backend_has_spec_session_fork`. */
export const ACP_SIDE_FORK_BACKENDS = ['claude', 'opencode', 'vibe'] as const;

export type AcpSideForkBackend = (typeof ACP_SIDE_FORK_BACKENDS)[number];

/**
 * Desktop sessions that may open the side panel. Matches backend
 * `is_side_supported_parent_type` (ACP + aionrs). Codex/Gemini/etc. are modern `acp` rows with a backend value;
 * legacy top-level rows remain read-only.
 */
const SIDE_PANEL_CONVERSATION_TYPES = new Set<TChatConversation['type']>(['acp', 'aionrs']);

export function isSideConversationSupported(target: SideConversationEligibilityTarget): boolean {
  return SIDE_PANEL_CONVERSATION_TYPES.has(target.type);
}

export function acpBackendUsesAgentFork(backend: string | undefined): boolean {
  if (!backend) return false;
  return (ACP_SIDE_FORK_BACKENDS as readonly string[]).includes(backend);
}

/** Hide ephemeral side threads from the session history list. */
export function isEphemeralSideConversation(conversation: Pick<TChatConversation, 'extra'>): boolean {
  return Boolean(conversation.extra?.side_mode && conversation.extra?.ephemeral);
}
