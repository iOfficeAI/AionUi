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

  return (
    content
      // Step 1: Remove complete <think>...</think> blocks (with optional spaces in tags)
      .replace(/<\s*think\s*>([\s\S]*?)<\s*\/\s*think\s*>/gi, '')
      // Step 2: Remove complete <thinking>...</thinking> blocks (with optional spaces in tags)
      .replace(/<\s*thinking\s*>([\s\S]*?)<\s*\/\s*thinking\s*>/gi, '')
      // Step 3: Remove orphaned closing tags BEFORE removing opening tags
      // (this handles cases where tags are split during streaming)
      .replace(/<\s*\/\s*think(?:ing)?\s*>/gi, '')
      // Step 4: Remove orphaned opening tags
      .replace(/<\s*think(?:ing)?\s*>/gi, '')
      // Step 5: Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      // Step 6: Remove leading/trailing whitespace
      .trim()
  );
}

/**
 * Check if content contains think tags
 * @param content - The content to check
 * @returns True if think tags are present
 */
export function hasThinkTags(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  return /<think(?:ing)?>/i.test(content);
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
