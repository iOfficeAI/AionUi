/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Split markdown into independently renderable top-level blocks.
 *
 * Purpose: streaming chat responses re-render markdown on every chunk. By
 * splitting content into stable blocks and memoizing each block's rendered
 * output, only the final (growing) block re-parses per chunk — completed
 * blocks become inert. This converts O(n²) parse work across a stream into
 * O(n).
 *
 * Guarantees:
 * - Lossless: `splitMarkdownBlocks(md).join('\n') === md` (each block keeps
 *   its trailing blank lines; the single newline separating two blocks is the
 *   join separator).
 * - Never splits inside fenced code blocks (``` / ~~~) — an unclosed fence
 *   extends to the end of input, matching CommonMark streaming behavior.
 * - Never splits inside `$$ … $$` math blocks.
 * - Never splits between consecutive list items or before indented
 *   continuation lines, so list numbering and loose/tight spacing are
 *   preserved.
 * - Prefix-stable: appending content never changes the boundaries of earlier
 *   blocks, so block indexes are stable cache keys during streaming.
 *
 * Known acceptable limitation: reference-style link definitions located in a
 * different block than their usage will not resolve.
 */

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;

const countMathDelimiters = (line: string): number => line.split('$$').length - 1;

export function splitMarkdownBlocks(markdown: string): string[] {
  if (!markdown) return [];

  const lines = markdown.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let pendingBoundary = false;
  /** Opening fence sequence (e.g. '```') while inside a fenced code block. */
  let openFence: string | null = null;
  let inMath = false;

  const lastNonBlank = (): string | null => {
    for (let i = current.length - 1; i >= 0; i--) {
      if (current[i].trim() !== '') return current[i];
    }
    return null;
  };

  const isClosingFence = (line: string): boolean => {
    if (!openFence) return false;
    const trimmed = line.trim();
    if (trimmed.length < openFence.length) return false;
    const char = openFence[0];
    for (const c of trimmed) {
      if (c !== char) return false;
    }
    return true;
  };

  for (const line of lines) {
    // Inside a fenced code block: accumulate until the closing fence.
    if (openFence) {
      current.push(line);
      if (isClosingFence(line)) openFence = null;
      continue;
    }

    // Inside a $$ math block: accumulate until the closing delimiter.
    if (inMath) {
      current.push(line);
      if (countMathDelimiters(line) % 2 === 1) inMath = false;
      continue;
    }

    const isBlank = line.trim() === '';

    if (isBlank) {
      // Blank lines belong to the current block's tail; they mark a
      // potential boundary once the block has visible content.
      if (lastNonBlank() !== null) pendingBoundary = true;
      current.push(line);
      continue;
    }

    if (pendingBoundary) {
      pendingBoundary = false;
      // Continuation rules — keep in the same block when:
      // - the line is indented (lazy continuation / nested list content)
      // - it starts a list item and the previous content was also a list
      //   item (preserves ordered-list numbering and loose-list spacing)
      const indented = /^\s/.test(line);
      const previous = lastNonBlank();
      const continuesList =
        LIST_ITEM_RE.test(line) && previous !== null && (LIST_ITEM_RE.test(previous) || /^\s/.test(previous));
      if (!indented && !continuesList) {
        blocks.push(current.join('\n'));
        current = [];
      }
    }

    current.push(line);

    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      openFence = fenceMatch[1];
    } else if (countMathDelimiters(line) % 2 === 1) {
      inMath = true;
    }
  }

  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

export default splitMarkdownBlocks;
