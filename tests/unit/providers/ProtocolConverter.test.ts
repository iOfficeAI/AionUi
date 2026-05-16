/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { OpenAI2AnthropicConverter } from '@/common/api/OpenAI2AnthropicConverter';
import type { OpenAIChatCompletionParams, OpenAIChatCompletionResponse } from '@/common/api/OpenAI2AnthropicConverter';

describe('OpenAI2AnthropicConverter', () => {
  describe('convertRequest', () => {
    it('extracts system message to separate parameter', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      };

      const result = converter.convertRequest(input);

      expect(result.system).toBe('You are a helpful assistant.');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({ role: 'user' });
    });

    it('converts simple user and assistant messages', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      const result = converter.convertRequest(input);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toMatchObject({ role: 'user', content: 'Hello' });
      expect(result.messages[1]).toMatchObject({ role: 'assistant', content: 'Hi there!' });
    });

    it('converts max_tokens parameter', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1000,
      };

      const result = converter.convertRequest(input);

      expect(result.max_tokens).toBe(1000);
    });

    it('converts temperature parameter', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
      };

      const result = converter.convertRequest(input);

      expect(result.temperature).toBe(0.7);
    });

    it('converts top_p parameter when temperature not set', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        top_p: 0.9,
      };

      const result = converter.convertRequest(input);

      expect(result.top_p).toBe(0.9);
    });

    it('prefers temperature when both temperature and top_p are set (Anthropic API constraint)', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        top_p: 0.9,
      };

      const result = converter.convertRequest(input);

      // Anthropic API forbids both; implementation chooses temperature
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBeUndefined();
    });

    it('converts stop sequences', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        stop: ['STOP', 'END'],
      };

      const result = converter.convertRequest(input);

      expect(result.stop_sequences).toEqual(['STOP', 'END']);
    });

    it('converts single stop string to array', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        stop: 'STOP',
      };

      const result = converter.convertRequest(input);

      expect(result.stop_sequences).toEqual(['STOP']);
    });

    it('uses default model from config', () => {
      const converter = new OpenAI2AnthropicConverter({ defaultModel: 'claude-opus-4-20250514' });
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
      };

      const result = converter.convertRequest(input);

      expect(result.model).toBe('claude-opus-4-20250514');
    });

    it('applies model mapping if configured', () => {
      const converter = new OpenAI2AnthropicConverter({
        modelMapping: { 'gpt-4': 'claude-sonnet-4-20250514' },
      });
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
      };

      const result = converter.convertRequest(input);

      expect(result.model).toBe('claude-sonnet-4-20250514');
    });

    it('converts multimodal content with images', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4-vision',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
            ],
          },
        ],
      };

      const result = converter.convertRequest(input);

      expect(result.messages[0].content).toBeInstanceOf(Array);
      const content = result.messages[0].content as any[];
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('image');
    });

    it('handles empty messages array', () => {
      const converter = new OpenAI2AnthropicConverter();
      const input: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = converter.convertRequest(input);

      expect(result.messages).toHaveLength(0);
    });
  });

  describe('convertResponse', () => {
    it('converts Anthropic response to OpenAI format', () => {
      const converter = new OpenAI2AnthropicConverter();
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      const result = converter.convertResponse(anthropicResponse, 'gpt-4');

      expect(result.id).toBe('msg_123');
      expect(result.model).toBe('gpt-4');
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].message.role).toBe('assistant');
      expect(result.choices[0].message.content).toBe('Hello!');
      expect(result.choices[0].finish_reason).toBe('stop');
    });

    it('converts usage tokens correctly', () => {
      const converter = new OpenAI2AnthropicConverter();
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'test' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      const result = converter.convertResponse(anthropicResponse, 'gpt-4');

      expect(result.usage).toEqual({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      });
    });

    it('converts stop_reason to finish_reason', () => {
      const converter = new OpenAI2AnthropicConverter();

      const testCases = [
        { anthropic: 'end_turn', openai: 'stop' },
        { anthropic: 'max_tokens', openai: 'length' },
        { anthropic: 'stop_sequence', openai: 'stop' },
      ];

      for (const { anthropic, openai } of testCases) {
        const response = {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'test' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: anthropic,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
        };

        const result = converter.convertResponse(response, 'gpt-4');
        expect(result.choices[0].finish_reason).toBe(openai);
      }
    });

    it('includes created timestamp', () => {
      const converter = new OpenAI2AnthropicConverter();
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'test' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = converter.convertResponse(anthropicResponse, 'gpt-4');

      expect(result.created).toBeGreaterThan(0);
      expect(typeof result.created).toBe('number');
    });

    it('sets object to chat.completion', () => {
      const converter = new OpenAI2AnthropicConverter();
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'test' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = converter.convertResponse(anthropicResponse, 'gpt-4');

      expect(result.object).toBe('chat.completion');
    });

    it('handles multiple text content blocks', () => {
      const converter = new OpenAI2AnthropicConverter();
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'First part. ' },
          { type: 'text', text: 'Second part.' },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = converter.convertResponse(anthropicResponse, 'gpt-4');

      expect(result.choices[0].message.content).toBe('First part. Second part.');
    });
  });

  describe('roundtrip conversion', () => {
    it('converts OpenAI → Anthropic → OpenAI preserving semantics', () => {
      const converter = new OpenAI2AnthropicConverter();
      const originalRequest: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        max_tokens: 100,
        temperature: 0.7,
      };

      const anthropicRequest = converter.convertRequest(originalRequest);
      expect(anthropicRequest.system).toBe('You are helpful.');
      expect(anthropicRequest.messages).toHaveLength(1);
      expect(anthropicRequest.max_tokens).toBe(100);
      expect(anthropicRequest.temperature).toBe(0.7);

      const mockAnthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const openaiResponse = converter.convertResponse(mockAnthropicResponse, 'gpt-4');
      expect(openaiResponse.choices[0].message.content).toBe('Hi there!');
      expect(openaiResponse.model).toBe('gpt-4');
      expect(openaiResponse.usage?.total_tokens).toBe(15);
    });
  });
});
