/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from '@jest/globals';
import { classifyMessages } from '@/process/services/devtools/messageClassifier';
import type { ParsedMessage } from '@/process/services/devtools/types';

describe('messageClassifier', () => {
  describe('classifyMessages', () => {
    it('should classify a real user message as "user"', () => {
      const messages = [createMessage({ type: 'user', content: 'Hello Claude' })];
      const classified = classifyMessages(messages);
      expect(classified).toHaveLength(1);
      expect(classified[0].category).toBe('user');
    });

    it('should classify assistant messages as "ai"', () => {
      const messages = [createMessage({ type: 'assistant', content: 'Here is my response' })];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('ai');
    });

    it('should classify meta user messages as "ai" (not user)', () => {
      const messages = [createMessage({ type: 'user', content: 'Some internal message', isMeta: true })];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('ai');
    });

    it('should classify user messages with toolResults as "ai"', () => {
      const messages = [
        createMessage({
          type: 'user',
          content: '',
          toolResults: [{ toolUseId: 'tu-1', content: 'result data', isError: false }],
        }),
      ];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('ai');
    });

    it('should classify user messages with sourceToolUseID as "ai"', () => {
      const messages = [
        createMessage({
          type: 'user',
          content: 'tool result feedback',
          sourceToolUseID: 'tu-1',
        }),
      ];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('ai');
    });

    it('should classify system-reminder messages as "hardNoise"', () => {
      const messages = [
        createMessage({ type: 'user', content: '<system-reminder>You must follow instructions</system-reminder>' }),
      ];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('hardNoise');
    });

    it('should classify other hard noise patterns correctly', () => {
      const patterns = [
        '<user-prompt-submit-hook>some data</user-prompt-submit-hook>',
        '<important-instruction>do not ignore</important-instruction>',
        '<caveat>be careful</caveat>',
        '<local-research-only>research data</local-research-only>',
        '<context-window-full>window is full</context-window-full>',
        '<repository-description>repo info</repository-description>',
      ];

      for (const pattern of patterns) {
        const messages = [createMessage({ type: 'user', content: pattern })];
        const classified = classifyMessages(messages);
        expect(classified[0].category).toBe('hardNoise');
      }
    });

    it('should classify <local-command-stdout> messages as "system"', () => {
      const messages = [
        createMessage({ type: 'user', content: '<local-command-stdout>ls output here</local-command-stdout>' }),
      ];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('system');
    });

    it('should classify summary type messages as "compact"', () => {
      const messages = [createMessage({ type: 'summary', content: 'Summary of conversation' })];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('compact');
    });

    it('should classify messages containing compaction text as "compact"', () => {
      const messages = [
        createMessage({ type: 'user', content: 'Here is a summary of the conversation so far: ...' }),
      ];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('compact');
    });

    it('should classify <summary> tag messages as "compact"', () => {
      const messages = [
        createMessage({ type: 'user', content: '<summary>Conversation summary</summary>' }),
      ];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('compact');
    });

    it('should respect priority: hardNoise > compact > system > user > ai', () => {
      // A message that matches both hardNoise and user should be hardNoise
      const msg = createMessage({
        type: 'user',
        content: '<system-reminder>reminder text</system-reminder>',
      });
      const classified = classifyMessages([msg]);
      expect(classified[0].category).toBe('hardNoise');
    });

    it('should handle multiple messages with different categories', () => {
      const messages = [
        createMessage({ type: 'user', content: 'User question' }),
        createMessage({ type: 'assistant', content: 'Assistant answer' }),
        createMessage({ type: 'user', content: '<system-reminder>noise</system-reminder>' }),
        createMessage({ type: 'summary', content: 'Summary' }),
      ];

      const classified = classifyMessages(messages);
      expect(classified.map((c) => c.category)).toEqual(['user', 'ai', 'hardNoise', 'compact']);
    });

    it('should handle content as array of blocks', () => {
      const messages = [
        createMessage({
          type: 'assistant',
          content: [{ type: 'text', text: 'Some response' }] as any,
        }),
      ];
      const classified = classifyMessages(messages);
      expect(classified[0].category).toBe('ai');
    });

    it('should return empty array for empty input', () => {
      expect(classifyMessages([])).toEqual([]);
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
