/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseJsonlFile, calculateMetrics, extractTextContent, countTokens } from '@/process/services/devtools/jsonlParser';
import type { ParsedMessage } from '@/process/services/devtools/types';

describe('jsonlParser', () => {
  // ==================== countTokens ====================
  describe('countTokens', () => {
    it('should estimate tokens as chars / 4 rounded up', () => {
      expect(countTokens('abcd')).toBe(1); // 4 / 4 = 1
      expect(countTokens('abcde')).toBe(2); // 5 / 4 = 1.25 → ceil = 2
      expect(countTokens('')).toBe(0);
      expect(countTokens('a')).toBe(1); // 1 / 4 = 0.25 → ceil = 1
    });

    it('should handle longer strings', () => {
      const text = 'x'.repeat(100);
      expect(countTokens(text)).toBe(25);
    });
  });

  // ==================== extractTextContent ====================
  describe('extractTextContent', () => {
    it('should return string content as-is', () => {
      expect(extractTextContent('Hello world')).toBe('Hello world');
    });

    it('should extract text from text content blocks', () => {
      const blocks = [
        { type: 'text' as const, text: 'Part 1' },
        { type: 'text' as const, text: 'Part 2' },
      ];
      expect(extractTextContent(blocks)).toBe('Part 1\nPart 2');
    });

    it('should extract thinking content', () => {
      const blocks = [
        { type: 'thinking' as const, thinking: 'I need to think about this' },
        { type: 'text' as const, text: 'Here is my answer' },
      ];
      expect(extractTextContent(blocks)).toBe('I need to think about this\nHere is my answer');
    });

    it('should ignore tool_use and tool_result blocks', () => {
      const blocks = [
        { type: 'text' as const, text: 'Hello' },
        { type: 'tool_use' as const, id: 'tu1', name: 'Read', input: { file_path: '/foo' } },
      ];
      expect(extractTextContent(blocks)).toBe('Hello');
    });

    it('should handle empty array', () => {
      expect(extractTextContent([])).toBe('');
    });
  });

  // ==================== calculateMetrics ====================
  describe('calculateMetrics', () => {
    it('should return empty metrics for empty array', () => {
      const metrics = calculateMetrics([]);
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.messageCount).toBe(0);
      expect(metrics.durationMs).toBe(0);
    });

    it('should aggregate usage from messages', () => {
      const messages: ParsedMessage[] = [
        createMessage({ timestamp: 1000, usage: { input_tokens: 100, output_tokens: 50 } }),
        createMessage({ timestamp: 2000, usage: { input_tokens: 200, output_tokens: 75, cache_read_input_tokens: 30 } }),
      ];

      const metrics = calculateMetrics(messages);
      expect(metrics.inputTokens).toBe(300);
      expect(metrics.outputTokens).toBe(125);
      expect(metrics.totalTokens).toBe(425);
      expect(metrics.cacheReadTokens).toBe(30);
      expect(metrics.durationMs).toBe(1000);
      expect(metrics.messageCount).toBe(2);
    });

    it('should handle messages without usage', () => {
      const messages: ParsedMessage[] = [
        createMessage({ timestamp: 1000 }),
        createMessage({ timestamp: 5000 }),
      ];

      const metrics = calculateMetrics(messages);
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.durationMs).toBe(4000);
      expect(metrics.messageCount).toBe(2);
    });
  });

  // ==================== parseJsonlFile ====================
  describe('parseJsonlFile', () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devtools-test-'));
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should parse a simple JSONL file with user and assistant messages', async () => {
      const lines = [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Hello Claude' },
          uuid: 'msg-1',
          timestamp: '2025-01-01T00:00:00Z',
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello! How can I help?' }],
            model: 'claude-3-opus',
            usage: { input_tokens: 10, output_tokens: 20 },
          },
          uuid: 'msg-2',
          parentUuid: 'msg-1',
          timestamp: '2025-01-01T00:00:01Z',
        }),
      ];

      const filePath = path.join(tmpDir, 'session1.jsonl');
      fs.writeFileSync(filePath, lines.join('\n'));

      const messages = await parseJsonlFile(filePath);
      expect(messages).toHaveLength(2);

      // User message
      expect(messages[0].uuid).toBe('msg-1');
      expect(messages[0].type).toBe('user');
      expect(messages[0].content).toBe('Hello Claude');
      expect(messages[0].toolCalls).toHaveLength(0);

      // Assistant message
      expect(messages[1].uuid).toBe('msg-2');
      expect(messages[1].type).toBe('assistant');
      expect(messages[1].model).toBe('claude-3-opus');
      expect(messages[1].usage).toEqual({ input_tokens: 10, output_tokens: 20 });
      expect(messages[1].parentUuid).toBe('msg-1');
    });

    it('should extract tool calls from assistant messages', async () => {
      const lines = [
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me read that file.' },
              { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/src/index.ts' } },
            ],
          },
          uuid: 'msg-3',
          timestamp: '2025-01-01T00:00:02Z',
        }),
      ];

      const filePath = path.join(tmpDir, 'session2.jsonl');
      fs.writeFileSync(filePath, lines.join('\n'));

      const messages = await parseJsonlFile(filePath);
      expect(messages).toHaveLength(1);
      expect(messages[0].toolCalls).toHaveLength(1);
      expect(messages[0].toolCalls[0].name).toBe('Read');
      expect(messages[0].toolCalls[0].id).toBe('tu-1');
      expect(messages[0].toolCalls[0].isTask).toBe(false);
    });

    it('should extract tool results from user messages', async () => {
      const lines = [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: '' },
          uuid: 'msg-4',
          timestamp: '2025-01-01T00:00:03Z',
          toolUseResult: { toolUseId: 'tu-1', content: 'file contents here', isError: false },
        }),
      ];

      const filePath = path.join(tmpDir, 'session3.jsonl');
      fs.writeFileSync(filePath, lines.join('\n'));

      const messages = await parseJsonlFile(filePath);
      expect(messages).toHaveLength(1);
      expect(messages[0].toolResults).toHaveLength(1);
      expect(messages[0].toolResults[0].toolUseId).toBe('tu-1');
      expect(messages[0].toolResults[0].content).toBe('file contents here');
      expect(messages[0].toolResults[0].isError).toBe(false);
    });

    it('should detect Task tool calls as subagents', async () => {
      const lines = [
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tu-task', name: 'Task', input: { description: 'Search for files' } },
            ],
          },
          uuid: 'msg-5',
          timestamp: '2025-01-01T00:00:04Z',
        }),
      ];

      const filePath = path.join(tmpDir, 'session4.jsonl');
      fs.writeFileSync(filePath, lines.join('\n'));

      const messages = await parseJsonlFile(filePath);
      expect(messages[0].toolCalls[0].isTask).toBe(true);
      expect(messages[0].toolCalls[0].taskDescription).toBe('Search for files');
    });

    it('should skip malformed lines gracefully', async () => {
      const lines = [
        'this is not json',
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Valid message' },
          uuid: 'msg-6',
          timestamp: '2025-01-01T00:00:05Z',
        }),
        '{ broken json',
        '',
      ];

      const filePath = path.join(tmpDir, 'session5.jsonl');
      fs.writeFileSync(filePath, lines.join('\n'));

      const messages = await parseJsonlFile(filePath);
      expect(messages).toHaveLength(1);
      expect(messages[0].uuid).toBe('msg-6');
    });

    it('should skip entries without type or message', async () => {
      const lines = [
        JSON.stringify({ something: 'else' }),
        JSON.stringify({ type: 'user' }), // no message field
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Valid' },
          uuid: 'msg-7',
          timestamp: '2025-01-01T00:00:06Z',
        }),
      ];

      const filePath = path.join(tmpDir, 'session6.jsonl');
      fs.writeFileSync(filePath, lines.join('\n'));

      const messages = await parseJsonlFile(filePath);
      expect(messages).toHaveLength(1);
      expect(messages[0].uuid).toBe('msg-7');
    });

    it('should assign generated UUIDs when none provided', async () => {
      const lines = [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'No UUID' },
          timestamp: '2025-01-01T00:00:07Z',
        }),
      ];

      const filePath = path.join(tmpDir, 'session7.jsonl');
      fs.writeFileSync(filePath, lines.join('\n'));

      const messages = await parseJsonlFile(filePath);
      expect(messages[0].uuid).toBe('msg-0');
    });
  });
});

// ==================== Test Helpers ====================

function createMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    uuid: `msg-${Math.random().toString(36).slice(2)}`,
    type: 'user',
    role: 'user',
    content: 'test message',
    timestamp: Date.now(),
    toolCalls: [],
    toolResults: [],
    ...overrides,
  };
}
