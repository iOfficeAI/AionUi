/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from '@jest/globals';
import { buildChunks } from '@/process/services/devtools/chunkBuilder';
import type { AIChunk, CompactChunk, ParsedMessage, SystemChunk, UserChunk } from '@/process/services/devtools/types';

describe('chunkBuilder', () => {
  describe('buildChunks', () => {
    it('should build a UserChunk from a real user message', () => {
      const messages: ParsedMessage[] = [
        createMessage({ type: 'user', content: 'Hello Claude', timestamp: 1000 }),
      ];

      const chunks = buildChunks(messages);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('user');

      const userChunk = chunks[0] as UserChunk;
      expect(userChunk.text).toBe('Hello Claude');
      expect(userChunk.startTime).toBe(1000);
    });

    it('should build AIChunks from assistant messages', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          type: 'assistant',
          content: [{ type: 'text', text: 'Here is my answer' }] as any,
          timestamp: 2000,
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      ];

      const chunks = buildChunks(messages);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('ai');

      const aiChunk = chunks[0] as AIChunk;
      expect(aiChunk.responses).toHaveLength(1);
    });

    it('should group consecutive AI messages into a single AIChunk', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          type: 'assistant',
          content: [{ type: 'text', text: 'Part 1' }] as any,
          timestamp: 1000,
        }),
        // User message with tool result (classified as "ai" since it has toolResults)
        createMessage({
          type: 'user',
          content: '',
          timestamp: 1500,
          toolResults: [{ toolUseId: 'tu-1', content: 'result', isError: false }],
        }),
        createMessage({
          type: 'assistant',
          content: [{ type: 'text', text: 'Part 2' }] as any,
          timestamp: 2000,
        }),
      ];

      const chunks = buildChunks(messages);
      // All three should be grouped into one AI chunk
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('ai');
      expect((chunks[0] as AIChunk).responses).toHaveLength(3);
    });

    it('should flush AI buffer when a user message arrives', () => {
      const messages: ParsedMessage[] = [
        createMessage({ type: 'assistant', content: 'Response 1', timestamp: 1000 }),
        createMessage({ type: 'user', content: 'User question', timestamp: 2000 }),
        createMessage({ type: 'assistant', content: 'Response 2', timestamp: 3000 }),
      ];

      const chunks = buildChunks(messages);
      expect(chunks).toHaveLength(3);
      expect(chunks[0].chunkType).toBe('ai');
      expect(chunks[1].chunkType).toBe('user');
      expect(chunks[2].chunkType).toBe('ai');
    });

    it('should build SystemChunks from <local-command-stdout> messages', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          type: 'user',
          content: '<local-command-stdout>npm test output</local-command-stdout>',
          timestamp: 1000,
        }),
      ];

      const chunks = buildChunks(messages);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('system');

      const systemChunk = chunks[0] as SystemChunk;
      expect(systemChunk.text).toBe('npm test output');
    });

    it('should build CompactChunks from summary messages', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          type: 'summary',
          content: 'Here is a summary of the conversation so far...',
          timestamp: 5000,
        }),
      ];

      const chunks = buildChunks(messages);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('compact');

      const compactChunk = chunks[0] as CompactChunk;
      expect(compactChunk.text).toContain('summary');
    });

    it('should filter out hardNoise messages entirely', () => {
      const messages: ParsedMessage[] = [
        createMessage({ type: 'user', content: '<system-reminder>Important reminder</system-reminder>', timestamp: 500 }),
        createMessage({ type: 'user', content: 'Real user input', timestamp: 1000 }),
      ];

      const chunks = buildChunks(messages);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('user');
      expect((chunks[0] as UserChunk).text).toBe('Real user input');
    });

    it('should filter out subagent messages (with agentId)', () => {
      const messages: ParsedMessage[] = [
        createMessage({ type: 'user', content: 'Main thread message', timestamp: 1000 }),
        createMessage({ type: 'assistant', content: 'Subagent response', timestamp: 1500, agentId: 'agent-123' }),
        createMessage({ type: 'assistant', content: 'Main thread response', timestamp: 2000 }),
      ];

      const chunks = buildChunks(messages);
      // Subagent message should be filtered out
      expect(chunks).toHaveLength(2);
      expect(chunks[0].chunkType).toBe('user');
      expect(chunks[1].chunkType).toBe('ai');
      expect((chunks[1] as AIChunk).responses).toHaveLength(1);
    });

    it('should extract semantic steps from AI chunks', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          type: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Let me think about this...' },
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/src/index.ts' } },
            { type: 'text', text: 'I found the file.' },
          ] as any,
          timestamp: 1000,
        }),
      ];

      const chunks = buildChunks(messages);
      const aiChunk = chunks[0] as AIChunk;
      expect(aiChunk.semanticSteps.length).toBeGreaterThanOrEqual(3);

      const types = aiChunk.semanticSteps.map((s) => s.type);
      expect(types).toContain('thinking');
      expect(types).toContain('tool_call');
      expect(types).toContain('output');
    });

    it('should collect subagent IDs from Task tool calls', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          type: 'assistant',
          content: [
            { type: 'tool_use', id: 'task-1', name: 'Task', input: { description: 'Search files' } },
          ] as any,
          timestamp: 1000,
          toolCalls: [{ id: 'task-1', name: 'Task', input: { description: 'Search files' }, isTask: true, taskDescription: 'Search files' }],
        }),
      ];

      const chunks = buildChunks(messages);
      const aiChunk = chunks[0] as AIChunk;
      expect(aiChunk.subagentIds).toContain('task-1');
    });

    it('should handle empty message array', () => {
      expect(buildChunks([])).toEqual([]);
    });

    it('should handle a realistic conversation flow', () => {
      const messages: ParsedMessage[] = [
        // User asks a question
        createMessage({ type: 'user', content: 'What is in src/index.ts?', timestamp: 1000 }),
        // Assistant thinks and uses a tool
        createMessage({
          type: 'assistant',
          content: [
            { type: 'thinking', thinking: 'The user wants to see index.ts' },
            { type: 'tool_use', id: 'tu-read', name: 'Read', input: { file_path: '/src/index.ts' } },
          ] as any,
          timestamp: 2000,
          toolCalls: [{ id: 'tu-read', name: 'Read', input: { file_path: '/src/index.ts' }, isTask: false }],
        }),
        // Tool result
        createMessage({
          type: 'user',
          content: '',
          timestamp: 2500,
          toolResults: [{ toolUseId: 'tu-read', content: 'console.log("hello")', isError: false }],
        }),
        // Assistant responds
        createMessage({
          type: 'assistant',
          content: [{ type: 'text', text: 'The file contains a console.log statement.' }] as any,
          timestamp: 3000,
        }),
        // User asks follow-up
        createMessage({ type: 'user', content: 'Can you edit it?', timestamp: 4000 }),
      ];

      const chunks = buildChunks(messages);
      expect(chunks).toHaveLength(3);
      expect(chunks[0].chunkType).toBe('user'); // "What is in src/index.ts?"
      expect(chunks[1].chunkType).toBe('ai'); // thinking + Read + result + response
      expect(chunks[2].chunkType).toBe('user'); // "Can you edit it?"

      const aiChunk = chunks[1] as AIChunk;
      expect(aiChunk.responses).toHaveLength(3); // assistant + tool_result user + assistant
      expect(aiChunk.toolExecutions).toHaveLength(1);
      expect(aiChunk.toolExecutions[0].toolName).toBe('Read');
    });
  });
});

// ==================== Test Helpers ====================

function createMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    uuid: `msg-${Math.random().toString(36).slice(2)}`,
    type: 'user',
    role: 'user',
    content: 'test',
    timestamp: Date.now(),
    toolCalls: [],
    toolResults: [],
    ...overrides,
  };
}
