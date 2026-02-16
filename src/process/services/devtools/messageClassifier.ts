/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Message classifier — categorizes parsed messages for chunk building.
 * Adapted from claude-devtools (MIT license).
 *
 * Categories:
 * - user: genuine user input
 * - system: <local-command-stdout> output
 * - compact: compaction summary markers
 * - hardNoise: filtered entirely (system metadata, caveats, reminders)
 * - ai: everything else (assistant, tool results, etc.)
 */

import { extractTextContent } from './jsonlParser';
import type { ParsedMessage } from './types';

export type MessageCategory = 'user' | 'system' | 'compact' | 'hardNoise' | 'ai';

export type ClassifiedMessage = {
  message: ParsedMessage;
  category: MessageCategory;
};

// Patterns that indicate hard noise (system metadata to filter out)
const HARD_NOISE_PATTERNS = [
  /^<system-reminder>/,
  /^<user-prompt-submit-hook>/,
  /^<important-instruction>/,
  /^<caveat>/,
  /^<local-research-only>/,
  /^<context-window-full>/,
  /^<repository-description>/,
];

// Pattern for system command output
const SYSTEM_OUTPUT_PATTERN = /<local-command-stdout>/;

// Pattern for compaction summary
const COMPACT_PATTERN = /Here is a summary of the conversation so far|<summary>/;

/**
 * Check if a message is a real user message (not internal or meta).
 */
function isRealUserMessage(msg: ParsedMessage): boolean {
  if (msg.type !== 'user') return false;
  if (msg.isMeta) return false;
  // Internal user messages are tool results being fed back
  if (msg.toolResults.length > 0) return false;
  if (msg.sourceToolUseID) return false;
  return true;
}

/**
 * Check if a message matches hard noise patterns.
 */
function isHardNoise(msg: ParsedMessage): boolean {
  const text = extractTextContent(msg.content);
  return HARD_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if a message is a system output message.
 */
function isSystemOutput(msg: ParsedMessage): boolean {
  const text = extractTextContent(msg.content);
  return SYSTEM_OUTPUT_PATTERN.test(text);
}

/**
 * Check if a message is a compaction summary.
 */
function isCompactMessage(msg: ParsedMessage): boolean {
  if (msg.type === 'summary') return true;
  const text = extractTextContent(msg.content);
  return COMPACT_PATTERN.test(text);
}

/**
 * Classify a single message into one of the 5 categories.
 * Priority order: hardNoise > compact > system > user > ai
 */
function classifyMessage(msg: ParsedMessage): MessageCategory {
  if (isHardNoise(msg)) return 'hardNoise';
  if (isCompactMessage(msg)) return 'compact';
  if (isSystemOutput(msg)) return 'system';
  if (isRealUserMessage(msg)) return 'user';
  return 'ai';
}

/**
 * Classify all messages in a session.
 */
export function classifyMessages(messages: ParsedMessage[]): ClassifiedMessage[] {
  return messages.map((message) => ({
    message,
    category: classifyMessage(message),
  }));
}
