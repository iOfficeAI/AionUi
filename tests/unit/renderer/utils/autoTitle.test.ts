/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAutoTitleFromContent, deriveAutoTitleFromMessages, generateTitleWithAI } from '@/renderer/utils/chat/autoTitle';
import type { TMessage } from '@/common/chat/chatLib';
import type { TProviderWithModel } from '@/common/config/storage';

vi.mock('@/renderer/utils/chat/thinkTagFilter', () => ({
  hasThinkTags: (content: string) => content.includes('<' + 'think>'),
  stripThinkTags: (content: string) => content.replace(new RegExp('<' + 'think>.*?<\\/think>', 'g'), ''),
}));

vi.mock('@/renderer/utils/chat/conversationExport', () => ({
  readMessageContent: (message: TMessage) => message.content || '',
}));

// Mock ClientFactory
const mockCreateChatCompletion = vi.fn();
vi.mock('@/common/api/ClientFactory', () => ({
  ClientFactory: {
    createRotatingClient: vi.fn().mockResolvedValue({
      createChatCompletion: mockCreateChatCompletion,
    }),
  },
}));

describe('autoTitle', () => {
  describe('buildAutoTitleFromContent', () => {
    it('returns first line of content', () => {
      const content = 'First line\nSecond line';
      expect(buildAutoTitleFromContent(content)).toBe('First line');
    });

    it('strips heading markdown', () => {
      expect(buildAutoTitleFromContent('## Heading')).toBe('Heading');
      expect(buildAutoTitleFromContent('# Title')).toBe('Title');
      expect(buildAutoTitleFromContent('### Another')).toBe('Another');
    });

    it('strips list markers', () => {
      expect(buildAutoTitleFromContent('* List item')).toBe('List item');
      expect(buildAutoTitleFromContent('- Dash item')).toBe('Dash item');
      expect(buildAutoTitleFromContent('1. Numbered item')).toBe('Numbered item');
    });

    it('strips blockquote markers', () => {
      expect(buildAutoTitleFromContent('> Quote')).toBe('Quote');
    });

    it('truncates to 50 characters', () => {
      const longText = 'a'.repeat(100);
      const result = buildAutoTitleFromContent(longText);
      expect(result).toHaveLength(50);
    });

    it('normalizes multiple spaces', () => {
      expect(buildAutoTitleFromContent('Text   with    spaces')).toBe('Text with spaces');
    });

    it('removes empty lines and code fence markers', () => {
      const content = '```\n\nFirst line\nSecond line';
      expect(buildAutoTitleFromContent(content)).toBe('First line');
    });

    it('handles CRLF line endings', () => {
      const content = 'First line\r\nSecond line';
      expect(buildAutoTitleFromContent(content)).toBe('First line');
    });

    it('strips think tags before processing', () => {
      const content = '<think>thinking</think>Main content';
      expect(buildAutoTitleFromContent(content)).toBe('Main content');
    });

    it('returns null for empty content', () => {
      expect(buildAutoTitleFromContent('')).toBeNull();
      expect(buildAutoTitleFromContent('   ')).toBeNull();
    });

    it('returns null for content with only markers', () => {
      expect(buildAutoTitleFromContent('```\n\n')).toBeNull();
      expect(buildAutoTitleFromContent('##')).toBeNull();
    });

    it('handles mixed whitespace', () => {
      expect(buildAutoTitleFromContent('  \n  First line  ')).toBe('First line');
    });

    it('handles content with only newlines', () => {
      expect(buildAutoTitleFromContent('\n\n\n')).toBeNull();
    });
  });

  describe('deriveAutoTitleFromMessages', () => {
    const mockUserMessage = (content: string): TMessage =>
      ({
        id: 'msg-1',
        type: 'text',
        position: 'right',
        content,
      }) as TMessage;

    const mockAssistantMessage = (content: string): TMessage =>
      ({
        id: 'msg-2',
        type: 'text',
        position: 'left',
        content,
      }) as TMessage;

    it('returns title from first user message', () => {
      const messages = [mockUserMessage('User question')];
      expect(deriveAutoTitleFromMessages(messages)).toBe('User question');
    });

    it('skips assistant messages', () => {
      const messages = [mockAssistantMessage('Assistant response'), mockUserMessage('User question')];
      expect(deriveAutoTitleFromMessages(messages)).toBe('User question');
    });

    it('returns fallback content when no user messages', () => {
      const messages = [mockAssistantMessage('Assistant response')];
      expect(deriveAutoTitleFromMessages(messages, 'Fallback title')).toBe('Fallback title');
    });

    it('returns null when no user messages and no fallback', () => {
      const messages = [mockAssistantMessage('Assistant response')];
      expect(deriveAutoTitleFromMessages(messages)).toBeNull();
    });

    it('skips empty user messages', () => {
      const messages = [mockUserMessage(''), mockUserMessage('Second message')];
      expect(deriveAutoTitleFromMessages(messages)).toBe('Second message');
    });

    it('handles empty message list with fallback', () => {
      expect(deriveAutoTitleFromMessages([], 'Fallback')).toBe('Fallback');
    });

    it('handles empty message list without fallback', () => {
      expect(deriveAutoTitleFromMessages([])).toBeNull();
    });

    it('processes markdown in user messages', () => {
      const messages = [mockUserMessage('## Title')];
      expect(deriveAutoTitleFromMessages(messages)).toBe('Title');
    });
  });

  describe('generateTitleWithAI', () => {
    const mockProvider: TProviderWithModel = {
      id: 'test-provider',
      platform: 'openai',
      name: 'Test Provider',
      base_url: 'https://api.openai.com/v1',
      api_key: 'test-key',
      models: ['gpt-4'],
      use_model: 'gpt-4',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns null for empty message', async () => {
      const result = await generateTitleWithAI('', mockProvider, 'en');
      expect(result).toBeNull();
      expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    });

    it('returns null for whitespace-only message', async () => {
      const result = await generateTitleWithAI('   ', mockProvider, 'en');
      expect(result).toBeNull();
      expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    });

    it('generates title from AI response', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Python Tutorial' } }],
      });

      const result = await generateTitleWithAI('How to learn Python programming', mockProvider, 'en');
      expect(result).toBe('Python Tutorial');
      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          max_tokens: 30,
          temperature: 0.3,
        }),
      );
    });

    it('cleans up quotes from AI response', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: '"Python Tutorial"' } }],
      });

      const result = await generateTitleWithAI('How to learn Python', mockProvider, 'en');
      expect(result).toBe('Python Tutorial');
    });

    it('cleans up Japanese quotes from AI response', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: '「Python入門」' } }],
      });

      const result = await generateTitleWithAI('Pythonの勉強方法', mockProvider, 'ja');
      expect(result).toBe('Python入門');
    });

    it('truncates to 15 characters', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'This is a very long title that should be truncated' } }],
      });

      const result = await generateTitleWithAI('Long message', mockProvider, 'en');
      expect(result?.length).toBeLessThanOrEqual(15);
    });

    it('returns null when AI returns empty response', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: '' } }],
      });

      const result = await generateTitleWithAI('Hello', mockProvider, 'en');
      expect(result).toBeNull();
    });

    it('returns null when AI call fails', async () => {
      mockCreateChatCompletion.mockRejectedValue(new Error('API error'));

      const result = await generateTitleWithAI('Hello', mockProvider, 'en');
      expect(result).toBeNull();
    });

    it('uses Chinese instruction for zh locale', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Python教程' } }],
      });

      await generateTitleWithAI('如何学习Python', mockProvider, 'zh');

      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('请用中文回复'),
            }),
          ]),
        }),
      );
    });

    it('uses Japanese instruction for ja locale', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Python入門' } }],
      });

      await generateTitleWithAI('Pythonの勉強方法', mockProvider, 'ja');

      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('日本語で返信してください'),
            }),
          ]),
        }),
      );
    });
  });
});
