/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Think Tag Detector
 *
 * Detects and strips <think> and <thinking> tags from AI agent responses.
 * These tags are used by some AI models (like MiniMax, DeepSeek, etc.) to show
 * internal reasoning, but should be filtered out from the user-facing display.
 *
 * Similar to Gemini's implementation in src/agent/gemini/utils.ts:104-127
 */

/**
 * Check if content contains think tags (opening or closing)
 * Supports: <think>...</think>, <thinking>...</thinking>
 * Also detects orphaned closing tags like </think> without opening <think>
 * (common with models like MiniMax M2.5)
 *
 * @param content - The text content to check
 * @returns True if think tags are present
 */
export function hasThinkTags(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  return /<\s*\/?\s*think(?:ing)?\s*>/i.test(protectMarkdownCode(content).text);
}

/**
 * Strip think tags from content
 * Removes both <think>...</think> and <thinking>...</thinking> blocks
 *
 * @param content - The text content to clean
 * @returns Content with think tags removed
 */
export function stripThinkTags(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  if (!hasThinkTags(content)) {
    return content;
  }

  const protectedContent = protectMarkdownCode(content);
  const stripped = protectedContent.text
    // Step 1: Remove complete <think>...</think> blocks (with optional spaces in tags)
    .replace(/<\s*think\s*>([\s\S]*?)<\s*\/\s*think\s*>/gi, '')
    // Step 2: Remove complete <thinking>...</thinking> blocks (with optional spaces in tags)
    .replace(/<\s*thinking\s*>([\s\S]*?)<\s*\/\s*thinking\s*>/gi, '')
    // Step 3: Handle MiniMax-style format: content before the FIRST orphaned </think>
    // Models like MiniMax M2.5 omit the opening tag: "thinking content...\n</think>\nresponse"
    .replace(/^[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/i, '')
    // Step 4: Remove any remaining orphaned closing tags (just the tags, preserve surrounding content)
    // When text gets concatenated across tool calls, there may be additional </think> tags
    .replace(/<\s*\/\s*think(?:ing)?\s*>/gi, '')
    // Step 5: Remove any remaining orphaned opening tags
    .replace(/<\s*think(?:ing)?\s*>/gi, '')
    // Step 6: Collapse multiple newlines
    .replace(/\n{3,}/g, '\n\n');

  return restoreMarkdownCode(stripped, protectedContent.segments);
}

/**
 * Extract think tag content and return both the thinking text and the stripped content.
 * Unlike stripThinkTags (which discards thinking) and extractThinkContent (which discards content),
 * this returns both parts for use in the inline thinking display.
 *
 * @param content - The text content to process
 * @returns Object with thinking content and stripped content
 */
export function extractAndStripThinkTags(content: string): { thinking: string; content: string } {
  if (!content || typeof content !== 'string') {
    return { thinking: '', content: '' };
  }

  const thinkingParts: string[] = [];

  // Extract complete <think>...</think> blocks
  for (const match of content.matchAll(/<\s*think\s*>([\s\S]*?)<\s*\/\s*think\s*>/gi)) {
    const part = match[1].trim();
    if (part) thinkingParts.push(part);
  }

  // Extract complete <thinking>...</thinking> blocks
  for (const match of content.matchAll(/<\s*thinking\s*>([\s\S]*?)<\s*\/\s*thinking\s*>/gi)) {
    const part = match[1].trim();
    if (part) thinkingParts.push(part);
  }

  // Handle MiniMax-style: content before orphaned </think>
  if (thinkingParts.length === 0) {
    const orphanMatch = content.match(/^([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/i);
    if (orphanMatch) {
      const part = orphanMatch[1].trim();
      if (part) thinkingParts.push(part);
    }
  }

  const stripped = stripThinkTags(content);
  return {
    thinking: thinkingParts.join('\n\n'),
    content: stripped,
  };
}

/**
 * Extract think tag content (for debugging or analytics)
 * Returns array of thinking content blocks
 *
 * @param content - The text content to extract from
 * @returns Array of thinking content strings
 */
export function extractThinkContent(content: string): string[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const results: string[] = [];

  // Extract <think> blocks
  const thinkMatches = content.matchAll(/<think>([\s\S]*?)<\/think>/gi);
  for (const match of thinkMatches) {
    const thinkContent = match[1].trim();
    if (thinkContent) {
      results.push(thinkContent);
    }
  }

  // Extract <thinking> blocks
  const thinkingMatches = content.matchAll(/<thinking>([\s\S]*?)<\/thinking>/gi);
  for (const match of thinkingMatches) {
    const thinkContent = match[1].trim();
    if (thinkContent) {
      results.push(thinkContent);
    }
  }

  return results;
}

type ProtectedMarkdownCode = {
  text: string;
  segments: string[];
};

function protectMarkdownCode(content: string): ProtectedMarkdownCode {
  const segments: string[] = [];
  let text = '';
  let index = 0;

  const pushProtected = (value: string) => {
    const placeholder = `__AIONUI_MARKDOWN_CODE_${segments.length}__`;
    segments.push(value);
    text += placeholder;
  };

  while (index < content.length) {
    const fence = readFence(content, index);
    if (fence) {
      pushProtected(content.slice(index, fence.end));
      index = fence.end;
      continue;
    }

    const codeSpan = readCodeSpan(content, index);
    if (codeSpan) {
      pushProtected(content.slice(index, codeSpan.end));
      index = codeSpan.end;
      continue;
    }

    text += content[index];
    index += 1;
  }

  return { text, segments };
}

function restoreMarkdownCode(content: string, segments: string[]): string {
  return segments.reduce(
    (result, segment, index) => result.replaceAll(`__AIONUI_MARKDOWN_CODE_${index}__`, segment),
    content
  );
}

function readCodeSpan(content: string, index: number): { end: number } | undefined {
  if (content[index] !== '`') return undefined;

  let length = 1;
  while (content[index + length] === '`') {
    length += 1;
  }

  if (length >= 3 && isLineStart(content, index)) {
    return undefined;
  }

  const marker = '`'.repeat(length);
  const closeIndex = content.indexOf(marker, index + length);
  if (closeIndex === -1) return undefined;
  return { end: closeIndex + length };
}

function readFence(content: string, index: number): { end: number } | undefined {
  if (!isLineStart(content, index)) return undefined;

  let cursor = index;
  while (content[cursor] === ' ' || content[cursor] === '\t') {
    cursor += 1;
  }

  if (cursor - index > 3) return undefined;

  const markerChar = content[cursor];
  if (markerChar !== '`' && markerChar !== '~') return undefined;

  let markerLength = 0;
  while (content[cursor + markerLength] === markerChar) {
    markerLength += 1;
  }

  if (markerLength < 3) return undefined;

  const openingLineEnd = content.indexOf('\n', cursor + markerLength);
  if (openingLineEnd === -1) {
    return { end: content.length };
  }

  const closingPattern = new RegExp(
    `(^|\\n)[ \\t]{0,3}${escapeRegExp(markerChar.repeat(markerLength))}${markerChar}*[ \\t]*(?:\\n|$)`,
    'g'
  );
  closingPattern.lastIndex = openingLineEnd + 1;
  const closingMatch = closingPattern.exec(content);
  if (!closingMatch) {
    return { end: content.length };
  }

  return { end: closingMatch.index + closingMatch[0].length };
}

function isLineStart(content: string, index: number): boolean {
  return index === 0 || content[index - 1] === '\n';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
