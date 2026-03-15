/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parsed mention result
 */
export interface IParsedMention {
  /** The raw mention string (e.g., '@Gemini') */
  raw: string;
  /** The agent name without '@' prefix, normalized to lowercase (e.g., 'gemini') */
  name: string;
  /** Start index of the mention in the original text */
  startIndex: number;
  /** End index (exclusive) of the mention in the original text */
  endIndex: number;
}

/**
 * Result of parsing mentions from a message
 */
export interface IMentionParseResult {
  /** Extracted mentions */
  mentions: IParsedMention[];
  /** The message text with mentions stripped out and trimmed */
  cleanText: string;
  /** Whether any mentions were found */
  hasMentions: boolean;
}

/**
 * Regex pattern for matching @mentions in message text.
 * Matches @AgentName where AgentName:
 * - Starts with a letter or CJK character
 * - Can contain letters, digits, hyphens, underscores, and CJK characters
 * - Is 1-32 characters long
 * - Is preceded by start-of-string or whitespace
 *
 * CJK ranges included: \u4e00-\u9fff (Common CJK), \u3400-\u4dbf (Extension A)
 */
const MENTION_REGEX = /(?:^|(?<=\s))@([\p{L}\p{N}_-]{1,32})(?=\s|$)/gu;

/**
 * Parse @mentions from message text.
 *
 * Extracts agent names mentioned with @ prefix and returns both
 * the parsed mentions and the cleaned text without mentions.
 *
 * @param text - The message text to parse
 * @returns Parsed mentions and cleaned text
 *
 * @example
 * ```typescript
 * parseMentions('@Gemini what is the weather?')
 * // { mentions: [{ raw: '@Gemini', name: 'gemini', ... }], cleanText: 'what is the weather?', hasMentions: true }
 *
 * parseMentions('@Claude @Gemini compare yourselves')
 * // { mentions: [{ name: 'claude', ... }, { name: 'gemini', ... }], cleanText: 'compare yourselves', hasMentions: true }
 *
 * parseMentions('hello world')
 * // { mentions: [], cleanText: 'hello world', hasMentions: false }
 * ```
 */
export function parseMentions(text: string): IMentionParseResult {
  if (!text) {
    return { mentions: [], cleanText: '', hasMentions: false };
  }

  const mentions: IParsedMention[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state for global regex
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    mentions.push({
      raw: match[0],
      name: match[1].toLowerCase(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Build clean text by removing mention substrings
  let cleanText = text;
  if (mentions.length > 0) {
    // Remove mentions from right to left to preserve indices
    for (let i = mentions.length - 1; i >= 0; i--) {
      const m = mentions[i];
      cleanText = cleanText.slice(0, m.startIndex) + cleanText.slice(m.endIndex);
    }
    // Collapse multiple spaces and trim
    cleanText = cleanText.replace(/\s{2,}/g, ' ').trim();
  }

  return {
    mentions,
    cleanText,
    hasMentions: mentions.length > 0,
  };
}

/**
 * Extract just the mention names from text (convenience function).
 *
 * @param text - The message text to parse
 * @returns Array of lowercase agent names mentioned (e.g., ['gemini', 'claude'])
 */
export function extractMentionNames(text: string): string[] {
  const result = parseMentions(text);
  return result.mentions.map((m) => m.name);
}
