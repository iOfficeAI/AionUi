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
 * Indicates where the slash command originates from.
 * - `acp`: Provided by the ACP agent (e.g., Claude)
 * - `builtin`: Built into the application
 */
export type SlashCommandSource = 'acp' | 'builtin';

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
}
