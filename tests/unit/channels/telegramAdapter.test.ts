/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { escapeHtml, markdownToTelegramHtml } from '@process/channels/plugins/telegram/TelegramAdapter';

describe('escapeHtml', () => {
  it('escapes ampersands, angle brackets', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('markdownToTelegramHtml', () => {
  it('converts bold markdown to HTML', () => {
    expect(markdownToTelegramHtml('**bold text**')).toBe('<b>bold text</b>');
  });

  it('converts italic markdown to HTML', () => {
    expect(markdownToTelegramHtml('*italic text*')).toBe('<i>italic text</i>');
  });

  it('converts inline code to HTML', () => {
    expect(markdownToTelegramHtml('use `code` here')).toBe('use <code>code</code> here');
  });

  it('converts code blocks to HTML', () => {
    const input = '```js\nconsole.log("hi")\n```';
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('<pre><code>');
    expect(result).toContain('console.log');
    expect(result).toContain('</code></pre>');
  });

  it('converts markdown links to HTML', () => {
    expect(markdownToTelegramHtml('[Google](https://google.com)')).toBe('<a href="https://google.com">Google</a>');
  });

  it('escapes HTML entities within markdown', () => {
    expect(markdownToTelegramHtml('**a & b**')).toBe('<b>a &amp; b</b>');
  });

  it('handles mixed formatting', () => {
    const input = '**bold** and *italic* with `code`';
    const result = markdownToTelegramHtml(input);
    expect(result).toBe('<b>bold</b> and <i>italic</i> with <code>code</code>');
  });

  it('returns plain text with only HTML escaping when no markdown', () => {
    expect(markdownToTelegramHtml('plain text')).toBe('plain text');
  });
});
