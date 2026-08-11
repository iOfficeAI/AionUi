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
  conversationType?: string;
  /** Current status for Codex conversations */
  codexStatus?: string | null;
}

/**
 * Determines whether the slash command autocomplete list should be enabled.
 *
 * Special case for Codex: Commands are only available when the session is
 * fully active (`session_active`), because Codex CLI does not support
 * command queries during the connection phase.
 *
 * @param input - Conversation type and status information
 * @returns true if slash commands should be enabled
 */
export function isSlashCommandListEnabled(input: SlashCommandListAvailabilityInput): boolean {
  if (input.conversationType !== 'codex') {
    return true;
  }
  return input.codexStatus === 'session_active';
}
