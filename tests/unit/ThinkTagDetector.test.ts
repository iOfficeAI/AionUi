/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { hasThinkTags, stripThinkTags, extractThinkContent } from '@/process/task/ThinkTagDetector';

describe('ThinkTagDetector', () => {
  describe('hasThinkTags', () => {
    it('should detect <think> tags', () => {
      expect(hasThinkTags('Hello <think>reasoning</think> world')).toBe(true);
    });

    it('should detect <thinking> tags', () => {
      expect(hasThinkTags('Hello <thinking>reasoning</thinking> world')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(hasThinkTags('Hello <THINK>reasoning</THINK> world')).toBe(true);
      expect(hasThinkTags('Hello <Thinking>reasoning</Thinking> world')).toBe(true);
    });

    it('should detect orphaned closing tags (MiniMax M2.5 style)', () => {
      expect(hasThinkTags('some thinking\n</think>\nresponse')).toBe(true);
      expect(hasThinkTags('reasoning...</thinking>\nanswer')).toBe(true);
    });

    it('should return false for content without think tags', () => {
      expect(hasThinkTags('Hello world')).toBe(false);
      expect(hasThinkTags('This is normal text')).toBe(false);
    });

    it('should handle empty or null input', () => {
      expect(hasThinkTags('')).toBe(false);
      expect(hasThinkTags(null as unknown as string)).toBe(false);
      expect(hasThinkTags(undefined as unknown as string)).toBe(false);
    });
  });

  describe('stripThinkTags', () => {
    it('should remove <think> tags and content', () => {
      const input = 'Hello <think>internal reasoning here</think> world';
      const expected = 'Hello  world';
      expect(stripThinkTags(input)).toBe(expected);
    });

    it('should remove orphaned closing tags and content before them', () => {
      const input = 'Some thinking content </think> actual response';
      const result = stripThinkTags(input);
      expect(result).not.toContain('</think>');
      expect(result).not.toContain('Some thinking content');
      expect(result).toContain('actual response');
    });

    it('should remove orphaned opening tags', () => {
      const input = 'Start <think> middle content';
      const result = stripThinkTags(input);
      expect(result).not.toContain('<think>');
      expect(result).toContain('Start');
      expect(result).toContain('middle content');
    });

    it('should handle tags with spaces', () => {
      const input = 'Text < think >reasoning</ think > more';
      const result = stripThinkTags(input);
      expect(result).not.toContain('<think>');
      expect(result).not.toContain('</think>');
      expect(result).toContain('Text');
      expect(result).toContain('more');
    });

    it('should remove <thinking> tags and content', () => {
      const input = 'Hello <thinking>internal reasoning here</thinking> world';
      const expected = 'Hello  world';
      expect(stripThinkTags(input)).toBe(expected);
    });

    it('should remove multiple think blocks', () => {
      const input = 'Start <think>first</think> middle <think>second</think> end';
      const expected = 'Start  middle  end';
      expect(stripThinkTags(input)).toBe(expected);
    });

    it('should handle multiline think content', () => {
      const input = `Before
<think>
Line 1
Line 2
Line 3
</think>
After`;
      const result = stripThinkTags(input);
      expect(result).toContain('Before');
      expect(result).toContain('After');
      expect(result).not.toContain('Line 1');
      expect(result).not.toContain('Line 2');
    });

    it('should remove orphaned opening tag but preserve content after it', () => {
      const input = 'Hello world <think> some text';
      const result = stripThinkTags(input);
      expect(result).not.toContain('<think>');
      expect(result).toContain('Hello world');
      expect(result).toContain('some text');
    });

    it('should collapse multiple newlines', () => {
      const input = 'Hello\n\n\n\nworld';
      const expected = 'Hello\n\nworld';
      expect(stripThinkTags(input)).toBe(expected);
    });

    it('should handle mixed think and thinking tags', () => {
      const input = 'Start <think>first</think> middle <thinking>second</thinking> end';
      const expected = 'Start  middle  end';
      expect(stripThinkTags(input)).toBe(expected);
    });

    it('should preserve content outside think tags', () => {
      const input = 'Here is my answer: <think>reasoning</think> The result is 42.';
      const result = stripThinkTags(input);
      expect(result).toContain('Here is my answer:');
      expect(result).toContain('The result is 42.');
      expect(result).not.toContain('reasoning');
    });

    it('should handle empty or null input', () => {
      expect(stripThinkTags('')).toBe('');
      expect(stripThinkTags(null as unknown as string)).toBe(null);
      expect(stripThinkTags(undefined as unknown as string)).toBe(undefined);
    });

    it('should handle content with no think tags', () => {
      const input = 'This is normal text without any tags';
      expect(stripThinkTags(input)).toBe(input);
    });
  });

  describe('extractThinkContent', () => {
    it('should extract content from <think> tags', () => {
      const input = 'Hello <think>reasoning 1</think> world <think>reasoning 2</think>';
      const result = extractThinkContent(input);
      expect(result).toEqual(['reasoning 1', 'reasoning 2']);
    });

    it('should extract content from <thinking> tags', () => {
      const input = 'Hello <thinking>reasoning 1</thinking> world <thinking>reasoning 2</thinking>';
      const result = extractThinkContent(input);
      expect(result).toEqual(['reasoning 1', 'reasoning 2']);
    });

    it('should extract from mixed tag types', () => {
      const input = 'Start <think>first</think> middle <thinking>second</thinking> end';
      const result = extractThinkContent(input);
      expect(result).toEqual(['first', 'second']);
    });

    it('should handle multiline content', () => {
      const input = `<think>
Line 1
Line 2
</think>`;
      const result = extractThinkContent(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('Line 1');
      expect(result[0]).toContain('Line 2');
    });

    it('should return empty array for content without think tags', () => {
      const input = 'This is normal text';
      expect(extractThinkContent(input)).toEqual([]);
    });

    it('should handle empty or null input', () => {
      expect(extractThinkContent('')).toEqual([]);
      expect(extractThinkContent(null as unknown as string)).toEqual([]);
      expect(extractThinkContent(undefined as unknown as string)).toEqual([]);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle MiniMax response with think tags', () => {
      const input = `<think>
I need to analyze the user's request carefully.
Let me break down the problem:
1. First point
2. Second point
</think>

Based on your question, here is my answer:

The solution involves implementing the following steps:
1. Step one
2. Step two

<think>Additional reasoning for refinement</think>

That should solve your problem!`;

      const result = stripThinkTags(input);
      expect(result).not.toContain('<think>');
      expect(result).not.toContain('</think>');
      expect(result).not.toContain('I need to analyze');
      expect(result).toContain('Based on your question');
      expect(result).toContain('Step one');
      expect(result).toContain('That should solve your problem!');
    });

    it('should handle MiniMax M2.5 format (no opening <think> tag)', () => {
      const input = `I need to analyze the user's request carefully.
Let me break down the problem:
1. First point
2. Second point
</think>

Based on your question, here is my answer:

The solution involves implementing the following steps:
1. Step one
2. Step two`;

      const result = stripThinkTags(input);
      expect(result).not.toContain('</think>');
      expect(result).not.toContain('I need to analyze');
      expect(result).not.toContain('First point');
      expect(result).toContain('Based on your question');
      expect(result).toContain('Step one');
      expect(result).toContain('Step two');
    });

    it('should handle streaming accumulated content (MiniMax M2.5 style)', () => {
      // Simulates frontend accumulated content from multiple streaming chunks:
      // Chunk 1: "I need to analyze..." (no tags, passed through)
      // Chunk 2: "Let me think...\n" (no tags, passed through)
      // Chunk 3: "</think>\n\nHere's my answer" (orphaned </think> preserved)
      const accumulated = "I need to analyze the user's request.\n" + 'Let me think about this carefully.\n' + "</think>\n\nHere's my answer:\n" + 'The solution is X.';

      const result = stripThinkTags(accumulated);
      expect(result).not.toContain('I need to analyze');
      expect(result).not.toContain('Let me think');
      expect(result).not.toContain('</think>');
      expect(result).toContain("Here's my answer");
      expect(result).toContain('The solution is X.');
    });

    it('should handle DeepSeek-style thinking tags', () => {
      const input = `<thinking>
Let me think through this step by step:
- First consideration
- Second consideration
</thinking>

Here is my final answer: 42`;

      const result = stripThinkTags(input);
      expect(result).not.toContain('thinking');
      expect(result).not.toContain('Let me think');
      expect(result).toContain('Here is my final answer: 42');
    });
  });
});
