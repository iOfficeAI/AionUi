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
  return /<\s*\/?\s*think(?:ing)?\s*>/i.test(content);
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

  return (
    content
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
      .replace(/\n{3,}/g, '\n\n')
      // Step 7: Remove leading/trailing whitespace
      .trim()
  );
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
