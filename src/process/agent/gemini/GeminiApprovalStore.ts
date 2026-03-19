/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseApprovalStore, type IApprovalKey } from '@/common/approval';

/**
 * Gemini-specific approval key
 * Supports exec, edit, and info action types
 */
export type GeminiApprovalKey = IApprovalKey & {
  action: 'exec' | 'edit' | 'info';
  /** For exec type: command name (e.g., 'curl', 'npm') */
  identifier?: string;
};

/**
 * Validate if a string is a valid command name for storage
 * Valid command names: start with letter or underscore, contain only alphanumeric, underscore, or hyphen
 * This filters out special shell characters like '[', ']', '(', ')' that may be parsed as commands
 */
function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
}

/**
 * Parse commandType string into individual commands
 * Handles comma-separated commands from piped operations (e.g., "curl, grep")
 * Filters out invalid command names (e.g., special shell characters)
 */
function parseCommandTypes(commandType: string): string[] {
  return commandType
    .split(',')
    .map((cmd) => cmd.trim())
    .filter(Boolean)
    .filter(isValidCommandName);
}

/**
 * GeminiApprovalStore - Session-level approval cache for Gemini permissions
 *
 * Stores "always allow" decisions so that identical operations
 * can be auto-approved without prompting the user again.
 *
 * Key design:
 * - Uses action + identifier as cache key
 * - For exec: identifier is command name (e.g., 'curl', 'npm')
 * - For edit/info: no identifier needed (generic approval)
 * - Scoped to a single conversation/session
 */
export class GeminiApprovalStore extends BaseApprovalStore<GeminiApprovalKey> {
  /**
   * Create approval keys from confirmation data
   * For exec confirmations with multiple commands, returns keys for each command
   */
  static createKeysFromConfirmation(action: string, commandType?: string): GeminiApprovalKey[] {
    if (action === 'exec' && commandType) {
      const commands = parseCommandTypes(commandType);
      return commands.map((cmd) => ({
        action: 'exec' as const,
        identifier: cmd,
      }));
    }

    if (action === 'edit') {
      return [{ action: 'edit' as const }];
    }

    if (action === 'info') {
      return [{ action: 'info' as const }];
    }

    return [];
  }

  /**
   * Create exec approval keys from command list
   */
  static createExecKeys(commands: string[]): GeminiApprovalKey[] {
    return commands.filter(isValidCommandName).map((cmd) => ({
      action: 'exec' as const,
      identifier: cmd,
    }));
  }
}
