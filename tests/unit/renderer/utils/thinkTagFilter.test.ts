/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { stripThinkTags, hasThinkTags, filterMessageContent } from '@/renderer/utils/chat/thinkTagFilter';

describe('thinkTagFilter', () => {
  describe('stripThinkTags', () => {
    it('removes <think> tags and content', () => {
      const input = 'Before<think>internal thought</think>After';
      expect(stripThinkTags(input)).toBe('BeforeAfter');
    });

    it('removes <thinking> tags and content', () => {
      const input = 'Text<thinking>analyzing</thinking>More';
      expect(stripThinkTags(input)).toBe('TextMore');
    });

    it('removes multiple think tags', () => {
      const input = '<think>first</think>Content<think>second</think>End';
      expect(stripThinkTags(input)).toBe('ContentEnd');
    });

    it('removes nested think tags', () => {
      const input = '<think>outer<think>inner</think>outer</think>Text';
      expect(stripThinkTags(input)).toBe('Text');
    });

    it('removes orphaned opening tags but preserves following text', () => {
      const input = 'Text<think>incomplete';
      expect(stripThinkTags(input)).toBe('Textincomplete');
    });

    it('removes orphaned closing tags', () => {
      const input = 'incomplete</think>Text';
      expect(stripThinkTags(input)).toBe('Text');
    });

    it('handles mixed think and thinking tags', () => {
      const input = '<think>a</think>X<thinking>b</thinking>Y';
      expect(stripThinkTags(input)).toBe('XY');
    });

    it('returns unchanged text without think tags', () => {
      const input = 'Normal text without tags';
      expect(stripThinkTags(input)).toBe(input);
    });

    it('handles empty string', () => {
      expect(stripThinkTags('')).toBe('');
    });

    it('handles string with only think tags', () => {
      expect(stripThinkTags('<think>only</think>')).toBe('');
    });

    it('preserves whitespace outside tags', () => {
      const input = '  Text  <think>remove</think>  More  ';
      expect(stripThinkTags(input)).toBe('  Text    More  ');
    });

    it('handles multiline think tags', () => {
      const input = 'Start\n<think>\nMultiline\nthought\n</think>\nEnd';
      expect(stripThinkTags(input)).toBe('Start\n\nEnd');
    });
  });

  describe('hasThinkTags', () => {
    it('detects <think> tag', () => {
      expect(hasThinkTags('Text<think>thought</think>')).toBe(true);
    });

    it('detects <thinking> tag', () => {
      expect(hasThinkTags('Text<thinking>analyzing</thinking>')).toBe(true);
    });

    it('detects orphaned opening tag', () => {
      expect(hasThinkTags('Text<think>incomplete')).toBe(true);
    });

    it('detects orphaned closing tag', () => {
      expect(hasThinkTags('incomplete</think>text')).toBe(true);
    });

    it('returns false for text without tags', () => {
      expect(hasThinkTags('Normal text')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasThinkTags('')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(hasThinkTags('<THINK>text</THINK>')).toBe(true);
      expect(hasThinkTags('<ThInK>text</ThInK>')).toBe(true);
    });

    it('detects multiple occurrences', () => {
      expect(hasThinkTags('<think>a</think>X<think>b</think>')).toBe(true);
    });
  });

  describe('filterMessageContent', () => {
    it('filters string content', () => {
      const content = 'Text<think>remove</think>More';
      expect(filterMessageContent(content)).toBe('TextMore');
    });

    it('filters content property in object', () => {
      const content = { content: 'Text<think>remove</think>' };
      expect(filterMessageContent(content)).toEqual({ content: 'Text' });
    });

    it('does not recurse into nested objects', () => {
      const content = {
        content: 'A<think>x</think>',
        nested: { content: 'B<think>y</think>' },
      };
      expect(filterMessageContent(content)).toEqual({
        content: 'A',
        nested: { content: 'B<think>y</think>' }, // nested.content not filtered
      });
    });

    it('preserves non-content fields', () => {
      const content = {
        content: '<think>remove</think>Text',
        id: 'msg-1',
        type: 'text',
      };
      expect(filterMessageContent(content)).toEqual({
        content: 'Text',
        id: 'msg-1',
        type: 'text',
      });
    });

    it('does not process arrays', () => {
      const content = [{ content: 'A<think>x</think>' }, { content: 'B<think>y</think>' }];
      expect(filterMessageContent(content)).toEqual([
        { content: 'A<think>x</think>' }, // array items not filtered
        { content: 'B<think>y</think>' },
      ]);
    });

    it('only filters top-level content property', () => {
      const content = {
        messages: [{ content: '<think>a</think>Text' }, { nested: { content: '<think>b</think>More' } }],
      };
      // filterMessageContent only filters the direct 'content' key
      // nested structures and arrays are not recursively processed
      expect(filterMessageContent(content)).toEqual({
        messages: [{ content: '<think>a</think>Text' }, { nested: { content: '<think>b</think>More' } }],
      });
    });

    it('returns primitives unchanged', () => {
      expect(filterMessageContent(null)).toBe(null);
      expect(filterMessageContent(undefined)).toBe(undefined);
      expect(filterMessageContent(42)).toBe(42);
      expect(filterMessageContent(true)).toBe(true);
    });

    it('handles empty object', () => {
      expect(filterMessageContent({})).toEqual({});
    });

    it('handles empty array', () => {
      expect(filterMessageContent([])).toEqual([]);
    });

    it('does not mutate original object', () => {
      const original = { content: 'A<think>x</think>' };
      const filtered = filterMessageContent(original);
      expect(original.content).toBe('A<think>x</think>');
      expect(filtered.content).toBe('A');
    });

    it('handles circular references gracefully', () => {
      const content: any = { content: 'Text<think>x</think>' };
      content.self = content;
      expect(() => filterMessageContent(content)).not.toThrow();
    });
  });
});
