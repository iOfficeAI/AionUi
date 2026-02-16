/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from '@jest/globals';
import { classifyContextInjections, summarizeContextBreakdown } from '@/process/services/devtools/contextClassifier';
import type { ParsedMessage } from '@/process/services/devtools/types';

function makeMessage(overrides: Partial<ParsedMessage>): ParsedMessage {
  return {
    uuid: 'test-uuid',
    type: 'user',
    role: 'user',
    content: '',
    timestamp: Date.now(),
    toolCalls: [],
    toolResults: [],
    ...overrides,
  };
}

describe('contextClassifier', () => {
  describe('classifyContextInjections', () => {
    it('should classify real user input', () => {
      const msg = makeMessage({ content: 'Hello, what is this project?' });
      const result = classifyContextInjections([msg]);

      expect(result).toHaveLength(1);
      expect(result[0].injections).toHaveLength(1);
      expect(result[0].injections[0].type).toBe('user_input');
      expect(result[0].totalTokens).toBeGreaterThan(0);
    });

    it('should classify tool results', () => {
      const msg = makeMessage({
        toolResults: [{ toolUseId: 'tu-1', content: 'File contents here', isError: false }],
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('tool_result');
    });

    it('should classify meta messages as system', () => {
      const msg = makeMessage({
        isMeta: true,
        content: 'Some system metadata',
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('unknown');
    });

    it('should classify CLAUDE.md content in meta messages', () => {
      const msg = makeMessage({
        isMeta: true,
        content: 'Contents of CLAUDE.md: ## Project Overview',
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('claude_md');
    });

    it('should classify system reminder content', () => {
      const msg = makeMessage({
        content: '<system-reminder>Always follow these instructions</system-reminder>',
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('system_reminder');
    });

    it('should classify assistant text output', () => {
      const msg = makeMessage({
        type: 'assistant',
        role: 'assistant',
        content: [{ type: 'text', text: 'Here is the answer to your question.' }],
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('assistant_output');
    });

    it('should classify thinking blocks', () => {
      const msg = makeMessage({
        type: 'assistant',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Let me think about this...' }],
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('thinking');
    });

    it('should classify tool_use blocks', () => {
      const msg = makeMessage({
        type: 'assistant',
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/src/index.ts' } }],
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('tool_input');
      expect(result[0].injections[0].source).toBe('Read');
    });

    it('should classify system messages', () => {
      const msg = makeMessage({
        type: 'system',
        role: 'system',
        content: 'System initialization message',
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('system_reminder');
    });

    it('should classify CLAUDE.md in system messages', () => {
      const msg = makeMessage({
        type: 'system',
        role: 'system',
        content: '## Project Overview\nThis is CLAUDE.md content',
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('claude_md');
    });

    it('should handle mixed assistant content blocks', () => {
      const msg = makeMessage({
        type: 'assistant',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Thinking...' },
          { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } },
          { type: 'text', text: 'Done!' },
        ],
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections).toHaveLength(3);
      expect(result[0].injections[0].type).toBe('thinking');
      expect(result[0].injections[1].type).toBe('tool_input');
      expect(result[0].injections[2].type).toBe('assistant_output');
    });

    it('should compute correct total tokens', () => {
      const msg = makeMessage({ content: 'Hello World' }); // ~3 tokens (11 chars / 4)
      const result = classifyContextInjections([msg]);

      expect(result[0].totalTokens).toBe(3);
    });

    it('should handle multiple messages', () => {
      const messages = [
        makeMessage({ uuid: 'u1', content: 'Hello' }),
        makeMessage({ uuid: 'a1', type: 'assistant', role: 'assistant', content: 'Hi there!' }),
      ];
      const result = classifyContextInjections(messages);

      expect(result).toHaveLength(2);
      expect(result[0].uuid).toBe('u1');
      expect(result[1].uuid).toBe('a1');
    });

    it('should handle empty content', () => {
      const msg = makeMessage({ content: '' });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections).toHaveLength(0);
      expect(result[0].totalTokens).toBe(0);
    });

    it('should handle tool results with errors', () => {
      const msg = makeMessage({
        toolResults: [{ toolUseId: 'tu-1', content: 'Error: file not found', isError: true }],
      });
      const result = classifyContextInjections([msg]);

      expect(result[0].injections[0].type).toBe('tool_result');
    });
  });

  describe('summarizeContextBreakdown', () => {
    it('should aggregate by type', () => {
      const messages = [
        makeMessage({ uuid: 'u1', content: 'Hello' }),
        makeMessage({ uuid: 'u2', content: 'World' }),
        makeMessage({
          uuid: 'a1',
          type: 'assistant',
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
        }),
      ];
      const contextInfo = classifyContextInjections(messages);
      const summary = summarizeContextBreakdown(contextInfo);

      expect(summary.byType.user_input).toBeDefined();
      expect(summary.byType.user_input.count).toBe(2);
      expect(summary.byType.assistant_output).toBeDefined();
      expect(summary.byType.assistant_output.count).toBe(1);
      expect(summary.totalTokens).toBeGreaterThan(0);
    });

    it('should compute top sources', () => {
      const messages = [
        makeMessage({
          uuid: 'a1',
          type: 'assistant',
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/foo.ts' } },
            { type: 'tool_use', id: 'tu-2', name: 'Bash', input: { command: 'ls' } },
          ],
        }),
      ];
      const contextInfo = classifyContextInjections(messages);
      const summary = summarizeContextBreakdown(contextInfo);

      expect(summary.topSources.length).toBeGreaterThanOrEqual(2);
      const readSource = summary.topSources.find((s) => s.source === 'Read');
      expect(readSource).toBeDefined();
    });

    it('should handle empty input', () => {
      const summary = summarizeContextBreakdown([]);

      expect(summary.totalTokens).toBe(0);
      expect(summary.topSources).toHaveLength(0);
    });
  });
});
