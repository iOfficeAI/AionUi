/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Input parameters for determining slash command list availability.
 */
export interface SlashCommandListAvailabilityInput {
  /** Type of conversation (e.g., 'gemini', 'codex', 'acp') */
  conversation_type?: string;
  /** Current status for Codex conversations */
  codexStatus?: string | null;
}

/**
 * Determines whether the slash command autocomplete list should be enabled.
 *
 * Slash commands are supported by ACP and aionrs agent types. The backend's
 * `/slash-commands` endpoint returns an empty list for other agent types
 * (openclaw-gateway / nanobot / remote), so calling it from those is waste
 * (and additionally 404s when the agent has not been warmed up yet).
 *
 * Special case for Codex (an ACP vendor): commands are only available when the
 * session is fully active (`session_active`), because Codex CLI does not
 * support command queries during the connection phase.
 *
 * @param input - Conversation type and status information
 * @returns true if slash commands should be enabled
 */
export function isSlashCommandListEnabled(input: SlashCommandListAvailabilityInput): boolean {
  if (input.conversation_type === 'codex') {
    return input.codexStatus === 'session_active';
  }
  return input.conversation_type === 'acp' || input.conversation_type === 'aionrs';
}
