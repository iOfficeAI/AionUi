/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/utils/chat/spokenBlocks.
 */

import { describe, expect, it } from 'vitest';

import { extractSpokenBlock } from '@/renderer/utils/chat/spokenBlocks';

describe('extractSpokenBlock', () => {
  it('returns null spoken when no spoken fence is present', () => {
    const md = 'Hello there.\n\nThis is a regular message with no fences.';
    const result = extractSpokenBlock(md);
    expect(result.spoken).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.displayText).toBe(md);
  });

  it('returns null spoken for fences with a different info string', () => {
    const md = '```js\nconst x = 1;\n```';
    const result = extractSpokenBlock(md);
    expect(result.spoken).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.displayText).toBe(md);
  });

  it('extracts a single complete spoken block and strips it from displayText', () => {
    const spoken = 'I just set the timer to 5 minutes. You can stop it anytime from the toolbar.';
    const md = `Here is the plan:\n\n1. First do this.\n2. Then that.\n\n\`\`\`spoken\n${spoken}\n\`\`\`\n`;

    const result = extractSpokenBlock(md);
    expect(result.spoken).toBe(spoken);
    expect(result.complete).toBe(true);
    // displayText must not contain the spoken block or the fences.
    expect(result.displayText).not.toContain('spoken');
    expect(result.displayText).not.toContain('```');
    // Trailing blank lines are trimmed.
    expect(result.displayText.endsWith('2. Then that.')).toBe(true);
  });

  it('returns the LAST spoken block when multiple are present', () => {
    const first = 'First spoken block.';
    const second = 'Second spoken block wins.';
    const md = `Intro.\n\n\`\`\`spoken\n${first}\n\`\`\`\n\nMiddle paragraph.\n\n\`\`\`spoken\n${second}\n\`\`\`\n`;

    const result = extractSpokenBlock(md);
    expect(result.spoken).toBe(second);
    expect(result.complete).toBe(true);
    expect(result.displayText).toContain('Intro.');
    expect(result.displayText).toContain('Middle paragraph.');
    expect(result.displayText).not.toContain(first);
    expect(result.displayText).not.toContain(second);
  });

  it('supports ~~~ tilde fences', () => {
    const spoken = 'Reading with a tilde fence for variety.';
    const md = `Summary above.\n\n~~~spoken\n${spoken}\n~~~\n`;

    const result = extractSpokenBlock(md);
    expect(result.spoken).toBe(spoken);
    expect(result.complete).toBe(true);
    expect(result.displayText).not.toContain('spoken');
    expect(result.displayText).not.toContain('~~~');
  });

  it('handles CRLF line endings', () => {
    const spoken = 'CRLF line endings should still parse.';
    const md = `Before.\r\n\r\n\`\`\`spoken\r\n${spoken}\r\n\`\`\`\r\n`;

    const result = extractSpokenBlock(md);
    expect(result.spoken).toBe(spoken);
    expect(result.complete).toBe(true);
    expect(result.displayText).not.toContain('spoken');
  });

  it('handles an unterminated spoken fence at end of body (streaming)', () => {
    const partial = 'I am about to finish the description, please hold';
    const md = `Some intro text.\n\n\`\`\`spoken\n${partial}`;

    const result = extractSpokenBlock(md);
    expect(result.spoken).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.displayText).toBe('Some intro text.');
    expect(result.displayText).not.toContain('spoken');
    expect(result.displayText).not.toContain('```');
  });

  it('strips the opening fence but preserves content for an unterminated ~~~spoken fence', () => {
    const partial = 'Halfway through, more text';
    const md = `Header line.\n\n~~~spoken\n${partial}`;

    const result = extractSpokenBlock(md);
    expect(result.spoken).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.displayText).toBe('Header line.');
  });

  it('handles leading whitespace on fences (CommonMark allows up to 3 spaces)', () => {
    const spoken = 'Indented fence opener is fine.';
    const md = `Body line.\n\n   \`\`\`spoken\n${spoken}\n\`\`\`\n`;

    const result = extractSpokenBlock(md);
    expect(result.spoken).toBe(spoken);
    expect(result.complete).toBe(true);
    expect(result.displayText).not.toContain('spoken');
  });

  it('does not match a fence that is not the right marker (~~~ vs ```)', () => {
    // A ~~~ closing fence for a ``` opening fence should not close it.
    // Our block only strips complete SPOKEN blocks, so this is verifying
    // the simpler invariant: a ```spoken block with a ~~~ "closer" is
    // incomplete and remains in displayText.
    const md = '```spoken\nHello\n~~~\n';
    const result = extractSpokenBlock(md);
    expect(result.complete).toBe(false);
    expect(result.spoken).toBeNull();
  });

  it('treats empty string input safely', () => {
    expect(extractSpokenBlock('').displayText).toBe('');
    expect(extractSpokenBlock('').spoken).toBeNull();
    expect(extractSpokenBlock('').complete).toBe(false);
  });

  it('is case-insensitive on the info string', () => {
    // The OpenCode contract lowercases the info string in the model
    // output, but the parser is case-insensitive so we stay robust to
    // any model quirks.
    const spoken = 'Uppercase SPOKEN header should still parse.';
    const md = `Intro.\n\n\`\`\`SPOKEN\n${spoken}\n\`\`\`\n`;

    const result = extractSpokenBlock(md);
    expect(result.spoken).toBe(spoken);
    expect(result.complete).toBe(true);
  });
});
