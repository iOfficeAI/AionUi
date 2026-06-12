/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { splitMarkdownBlocks } from '@/renderer/components/Markdown/splitMarkdownBlocks';

/**
 * Lossless invariant (documented in the source): joining the blocks with
 * '\n' reproduces the original input exactly. Every fixture is checked
 * against this property.
 */
function expectLossless(md: string): void {
  const blocks = splitMarkdownBlocks(md);
  expect(blocks.join('\n')).toBe(md);
}

/**
 * Strip each block's trailing blank lines and the single joiner '\n' so
 * the test can assert on the visible (non-blank) content. This makes the
 * tests robust to the documented behaviour that blocks keep their own
 * trailing blank lines.
 */
function visibleBlocks(md: string): string[] {
  return splitMarkdownBlocks(md).map((b: string) => b.replace(/\n+$/, ''));
}

describe('splitMarkdownBlocks — basic structure', () => {
  it('returns an empty array for an empty string', () => {
    expect(splitMarkdownBlocks('')).toEqual([]);
  });

  it('returns one block for a single paragraph', () => {
    const md = 'hello world';
    expectLossless(md);
    expect(splitMarkdownBlocks(md)).toEqual([md]);
  });

  it('splits two paragraphs separated by a blank line into two blocks', () => {
    const md = 'first paragraph\n\nsecond paragraph';
    expectLossless(md);
    expect(splitMarkdownBlocks(md)).toHaveLength(2);
    expect(visibleBlocks(md)).toEqual(['first paragraph', 'second paragraph']);
  });

  it('splits a heading and a paragraph separated by a blank line into two blocks', () => {
    const md = '# Title\n\nBody text here.';
    expectLossless(md);
    expect(splitMarkdownBlocks(md)).toHaveLength(2);
    expect(visibleBlocks(md)).toEqual(['# Title', 'Body text here.']);
  });

  it('treats multiple consecutive blank lines between paragraphs as a single boundary (still lossless)', () => {
    const md = 'first\n\n\n\nsecond';
    expectLossless(md);
    // No spurious empty blocks in the middle.
    expect(visibleBlocks(md)).toEqual(['first', 'second']);
  });
});

describe('splitMarkdownBlocks — fenced code blocks', () => {
  it('keeps a closed fenced code block that contains blank lines as a single block', () => {
    const md = 'before\n\n```ts\nconst x = 1;\n\nconst y = 2;\n```\n\nafter';
    expectLossless(md);
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(visibleBlocks(md)).toEqual(['before', '```ts\nconst x = 1;\n\nconst y = 2;\n```', 'after']);
    // The fence block must be a single block — its inner blank lines must
    // not split the block.
    expect(blocks[1].split('\n').length).toBeGreaterThan(4);
  });

  it('keeps unclosed fence content in the final block (streaming case)', () => {
    // Real streaming chunks often arrive mid-fence with no closing yet.
    // Everything from the opening fence to EOF must be one block, so the
    // final (growing) block is the only one re-parsed per tick.
    const md = 'intro\n\n```ts\ncode line 1\n\ncode line 2';
    expectLossless(md);
    // The first block gets the trailing blank line(s) per the documented
    // behaviour; the second (and only other) block holds the whole fence.
    expect(splitMarkdownBlocks(md)).toHaveLength(2);
    expect(visibleBlocks(md)).toEqual(['intro', '```ts\ncode line 1\n\ncode line 2']);
  });

  it('accepts ~~~ tilde fences and treats them the same as backtick fences', () => {
    const md = 'before\n\n~~~python\ndef f():\n    pass\n\n    return\n~~~\n\nafter';
    expectLossless(md);
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(visibleBlocks(md)).toEqual(['before', '~~~python\ndef f():\n    pass\n\n    return\n~~~', 'after']);
  });

  it('accepts a closing fence that is longer than the opening fence (CommonMark: ≥ length)', () => {
    // Opening is ```, closing is ```` — CommonMark says the closing fence
    // must be at least as long as the opening.
    const md = 'intro\n\n```\nbody\n````\n\nafter';
    expectLossless(md);
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(visibleBlocks(md)).toEqual(['intro', '```\nbody\n````', 'after']);
  });

  it('does NOT close a fence with a shorter sequence of the same character', () => {
    // ``` opened with 3 backticks; `` is too short to close it. The body
    // and everything below stays inside the fence.
    const md = '```\nconst a = 1;\n``\nconst b = 2;\n```';
    expectLossless(md);
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe(md);
  });
});

describe('splitMarkdownBlocks — $$ math blocks', () => {
  it('keeps a $$ math block spanning blank lines as a single block', () => {
    const md = 'before\n\n$$\nx = 1\n\ny = 2\n$$\n\nafter';
    expectLossless(md);
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(visibleBlocks(md)).toEqual(['before', '$$\nx = 1\n\ny = 2\n$$', 'after']);
  });

  it('keeps an unclosed $$ at the end of input inside the tail block', () => {
    const md = 'intro\n\n$$\nx = 1\n\ny = 2';
    expectLossless(md);
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(visibleBlocks(md)).toEqual(['intro', '$$\nx = 1\n\ny = 2']);
  });
});

describe('splitMarkdownBlocks — lists', () => {
  it('keeps a numbered list with blank-line separators as one block', () => {
    const md = '1. first\n\n2. second\n\n3. third';
    expectLossless(md);
    expect(splitMarkdownBlocks(md)).toEqual([md]);
  });

  it('keeps a bullet list with blank lines between items as one block', () => {
    const md = '- one\n\n- two\n\n- three';
    expectLossless(md);
    expect(splitMarkdownBlocks(md)).toEqual([md]);
  });

  it('keeps a list item + indented continuation paragraph (after blank) in one block', () => {
    // Per CommonMark, a continuation paragraph after a list item is
    // indented. The splitter must not split between the list item and its
    // continuation.
    const md = '- first item\n\n  continuation paragraph\n\n- second item';
    expectLossless(md);
    expect(splitMarkdownBlocks(md)).toEqual([md]);
  });
});

describe('splitMarkdownBlocks — GFM tables', () => {
  it('keeps a contiguous GFM table as one block', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |';
    expectLossless(md);
    expect(splitMarkdownBlocks(md)).toEqual([md]);
  });

  it('splits when the table is followed by a blank line and a paragraph', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |\n\nparagraph after';
    expectLossless(md);
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(visibleBlocks(md)).toEqual(['| a | b |\n| - | - |\n| 1 | 2 |', 'paragraph after']);
  });
});

describe('splitMarkdownBlocks — prefix stability (streaming invariant)', () => {
  // The streaming invariant: for any prefix `p` of `md`, the blocks of `p`
  // (excluding its last, possibly-incomplete block) must be a prefix of the
  // blocks of `md`. Equivalently: appending more content never changes the
  // boundaries of already-finalized blocks.

  const longFixture = [
    '# Heading',
    '',
    'First paragraph with some prose.',
    '',
    '- list item one',
    '',
    '- list item two',
    '',
    '## Subheading',
    '',
    '```ts',
    'const x = 1;',
    '',
    'const y = 2;',
    '```',
    '',
    'Closing paragraph.',
    '',
  ].join('\n');

  function cutPoints(md: string): number[] {
    // Cut after every line, plus a couple of mid-line positions to hit
    // in-progress prefixes.
    const points = new Set<number>([0, md.length]);
    let idx = 0;
    for (const line of md.split('\n')) {
      idx += line.length + 1; // +1 for '\n'
      if (idx > 0 && idx <= md.length) points.add(idx);
    }
    points.add(Math.floor(md.length / 3));
    points.add(Math.floor((md.length * 2) / 3));
    return [...points].filter((p) => p >= 0 && p <= md.length).toSorted((a: number, b: number) => a - b);
  }

  it('appending content to any prefix never shifts the boundaries of earlier blocks', () => {
    const full = splitMarkdownBlocks(longFixture);
    for (const cut of cutPoints(longFixture)) {
      const prefix = longFixture.slice(0, cut);
      const prefixBlocks = splitMarkdownBlocks(prefix);
      // All but the (possibly-incomplete) last block of the prefix must
      // match the corresponding blocks of the full string.
      const completedFromPrefix = prefixBlocks.slice(0, -1);
      for (let i = 0; i < completedFromPrefix.length; i++) {
        expect(completedFromPrefix[i]).toBe(full[i]);
      }
    }
  });

  it('every prefix is itself lossless (split then join reproduces the prefix)', () => {
    for (const cut of cutPoints(longFixture)) {
      const prefix = longFixture.slice(0, cut);
      expect(splitMarkdownBlocks(prefix).join('\n')).toBe(prefix);
    }
  });
});
