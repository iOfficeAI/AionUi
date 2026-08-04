/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session-fork capability as projected on the conversation DETAIL response
 * (`ConversationResponse.fork_capability`). Sourced server-side from
 * `agent_metadata.agent_capabilities.session_capabilities.fork`; absent =
 * the agent declares no fork support (e.g. antigravity) and the entry point
 * must stay hidden.
 */
export type TForkCapability = { at_turn: boolean };

/**
 * Whether the fork entry point should be shown on one message.
 *
 * - No capability → never.
 * - `at_turn` (codex `thread/fork` + `lastTurnId`) → every message.
 * - Otherwise (claude `--fork-session`, ACP `session/fork`) → only messages of
 *   the LATEST turn: those backends fork the whole session at HEAD, and a
 *   mid-history entry point would produce a fork whose backend context still
 *   contains everything after the visible cut — the agent would "remember"
 *   more than the copied history shows.
 */
export function isForkEnabled(capability: TForkCapability | undefined, isLastTurn: boolean): boolean {
  if (!capability) return false;
  return capability.at_turn || isLastTurn;
}
