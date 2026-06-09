/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Defines how a slash command is executed.
 * - `template`: Expands into a prompt template text
 * - `builtin`: Executes a built-in application action (e.g., /open for file picker)
 */
export type SlashCommandKind = 'template' | 'builtin';

/**
 * Defines what happens when the user selects a slash command from the menu.
 * - `execute`: run the command immediately
 * - `insert`: insert `/<name> ` into the input
 */
export type SlashCommandSelectionBehavior = 'execute' | 'insert';

/**
 * Defines what follow-up UX to use after a slash command is selected and the turn ends empty.
 */
export type SlashCommandCompletionBehavior = 'normal' | 'neutral_tip_on_empty';

/**
 * Indicates where the slash command originates from.
 * - `acp`: Provided by the ACP agent (e.g., Claude)
 * - `builtin`: Built into the application
 */
export type SlashCommandSource = 'acp' | 'builtin';

/**
 * Live ACP available_commands payload as it appears on the websocket stream.
 */
export interface AcpAvailableCommand {
  name: string;
  description: string;
  hint?: string;
  input?: {
    hint?: string;
  };
  _meta?: {
    completion_behavior?: SlashCommandCompletionBehavior;
    empty_turn_tip_code?: string;
    empty_turn_tip_params?: Record<string, unknown>;
  };
}

/**
 * ACP slash command item returned by the HTTP slash-commands endpoint.
 */
export interface AcpSlashCommandApiItem {
  command: string;
  description: string;
  hint?: string;
  completion_behavior?: SlashCommandCompletionBehavior;
  empty_turn_tip_code?: string;
  empty_turn_tip_params?: Record<string, unknown>;
  completionBehavior?: SlashCommandCompletionBehavior;
  emptyTurnTipCode?: string;
  emptyTurnTipParams?: Record<string, unknown>;
}

/**
 * Represents a single slash command item in the autocomplete list.
 */
export interface SlashCommandItem {
  /** Command name without the leading slash (e.g., "open", "test") */
  name: string;
  /** Human-readable description shown in the dropdown */
  description: string;
  /** How the command is executed */
  kind: SlashCommandKind;
  /** Where the command comes from */
  source: SlashCommandSource;
  /** Optional keyboard hint (e.g., "⌘O") */
  hint?: string;
  /** Optional override for how selection behaves in the slash menu */
  selectionBehavior?: SlashCommandSelectionBehavior;
  /** Optional override for empty-turn completion behavior */
  completionBehavior?: SlashCommandCompletionBehavior;
  /** Optional localization code for the empty-turn neutral tip */
  emptyTurnTipCode?: string;
  /** Optional interpolation params for the empty-turn neutral tip */
  emptyTurnTipParams?: Record<string, unknown>;
}
