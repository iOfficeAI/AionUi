/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Frontend think tag filter
 * Filters think tags from message content before rendering
 * This handles historical messages that were saved before the filter was implemented
 */

/**
 * Strip think tags from content
 * @param content - The content to filter
 * @returns Filtered content without think tags
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
 * Check if content contains think tags (opening or closing)
 * Also detects orphaned closing tags like </think> without opening <think>
 * @param content - The content to check
 * @returns True if think tags are present
 */
export function hasThinkTags(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  return /<\s*\/?\s*think(?:ing)?\s*>/i.test(protectMarkdownCode(content).text);
}

/**
 * Filter think tags from message content object
 * Handles various message content structures
 * @param content - The message content (string or object)
 * @returns Filtered content
 */
export function filterMessageContent(content: any): any {
  // Handle string content
  if (typeof content === 'string') {
    return hasThinkTags(content) ? stripThinkTags(content) : content;
  }

  // Handle object with content property
  if (content && typeof content === 'object' && 'content' in content) {
    const innerContent = content.content;
    if (typeof innerContent === 'string' && hasThinkTags(innerContent)) {
      return {
        ...content,
        content: stripThinkTags(innerContent),
      };
    }
  }

  return content;
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
