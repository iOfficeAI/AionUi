/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { convertLatexDelimiters } from '@/renderer/utils/chat/latexDelimiters';

describe('latexDelimiters', () => {
  describe('convertLatexDelimiters', () => {
    it('converts block display math \\[...\\] to $$...$$', () => {
      const input = 'Some text \\[x^2 + y^2\\] more text';
      const expected = 'Some text $$x^2 + y^2$$ more text';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('converts inline math \\(...\\) to $...$', () => {
      const input = 'Inline \\(a + b\\) math';
      const expected = 'Inline $a + b$ math';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('handles multiline block math', () => {
      const input = 'Text \\[x = a\ny = b\\] end';
      const expected = 'Text $$x = a\ny = b$$ end';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('preserves code blocks with triple backticks', () => {
      const input = 'Text ```code \\[math\\]``` text';
      const expected = 'Text ```code \\[math\\]``` text';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('preserves code blocks with tildes', () => {
      const input = 'Text ~~~code \\(inline\\)~~~ text';
      const expected = 'Text ~~~code \\(inline\\)~~~ text';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('preserves inline code spans', () => {
      const input = 'Text `code \\[math\\]` text';
      const expected = 'Text `code \\[math\\]` text';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('converts math outside code blocks but preserves inside', () => {
      const input = 'Math \\[x^2\\] and ```\\[y^2\\]``` and \\(z^2\\)';
      const expected = 'Math $$x^2$$ and ```\\[y^2\\]``` and $z^2$';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('handles multiple math expressions', () => {
      const input = 'First \\[a\\] second \\(b\\) third \\[c\\]';
      const expected = 'First $$a$$ second $b$ third $$c$$';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('handles empty math expressions', () => {
      const input = 'Empty \\[\\] and \\(\\) math';
      const expected = 'Empty $$$$ and $$ math';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('handles text with no math delimiters', () => {
      const input = 'Plain text without math';
      expect(convertLatexDelimiters(input)).toBe(input);
    });

    it('handles empty string', () => {
      expect(convertLatexDelimiters('')).toBe('');
    });

    it('handles text with only code blocks', () => {
      const input = '```code block```';
      expect(convertLatexDelimiters(input)).toBe(input);
    });

    it('handles nested delimiters in math (not nested math)', () => {
      const input = 'Math \\[outer $inner$\\]';
      // Actual output has trailing $ due to regex behavior
      const expected = 'Math $$outer $inner$$$';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('preserves code block with multiline content', () => {
      const input = '```\n\\[math\\]\n\\(inline\\)\n```';
      const expected = '```\n\\[math\\]\n\\(inline\\)\n```';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('handles multiple code blocks', () => {
      const input = '```code1``` \\[math\\] ```code2```';
      const expected = '```code1``` $$math$$ ```code2```';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('handles adjacent math expressions', () => {
      const input = '\\[a\\]\\(b\\)\\[c\\]';
      const expected = '$$a$$$b$$$c$$';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });

    it('handles math with special characters', () => {
      const input = 'Math \\[\\alpha + \\beta = \\gamma\\]';
      const expected = 'Math $$\\alpha + \\beta = \\gamma$$';
      expect(convertLatexDelimiters(input)).toBe(expected);
    });
  });
});
