import { describe, expect, it } from 'vitest';

import { OpenAI2GeminiConverter, type OpenAIChatCompletionParams } from '@/common/api/OpenAI2GeminiConverter';

describe('OpenAI2GeminiConverter', () => {
  it('requests image and text modalities for image generation prompts', () => {
    const converter = new OpenAI2GeminiConverter();

    const request = converter.convertRequest({
      model: 'gemini-3-pro-image-preview',
      messages: [{ role: 'user', content: 'Generate image: a glass cup' }],
    });

    expect(request.generationConfig?.responseModalities).toEqual(['IMAGE', 'TEXT']);
  });

  it('converts Gemini inline image data to OpenAI-compatible message images', () => {
    const converter = new OpenAI2GeminiConverter();

    const response = converter.convertResponse(
      {
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                { text: 'done' },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'ZmFrZS1pbWFnZQ==',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
      },
      'gemini-3-pro-image-preview'
    );

    expect(response.choices[0].message.images).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==' },
      },
    ]);
  });

  describe('extra OpenAI params pass-through (#541)', () => {
    // The interface change is type-level; these tests verify the converter
    // accepts the additional fields at runtime without crashing. The actual
    // pass-through to the OpenAI SDK is verified in imageGenCore tests.

    it('accepts service_tier without type error', () => {
      const converter = new OpenAI2GeminiConverter();
      const params: OpenAIChatCompletionParams = {
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        service_tier: 'flex',
      };

      const request = converter.convertRequest(params);

      expect(request.model).toBe('gemini-1.5-flash');
      expect(request.contents).toHaveLength(1);
    });

    it('accepts temperature and does not emit it in the Gemini request', () => {
      const converter = new OpenAI2GeminiConverter();
      const params: OpenAIChatCompletionParams = {
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        temperature: 0.7,
      };

      const request = converter.convertRequest(params) as Record<string, unknown>;

      // Gemini converter does not translate temperature; verify it was silently dropped
      expect(request.temperature).toBeUndefined();
      expect(request.generationConfig).toBeUndefined();
    });

    it('accepts top_p without crashing', () => {
      const converter = new OpenAI2GeminiConverter();
      const params: OpenAIChatCompletionParams = {
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        top_p: 0.9,
      };

      const request = converter.convertRequest(params) as Record<string, unknown>;

      expect(request.top_p).toBeUndefined();
    });

    it('accepts multiple extra fields at once', () => {
      const converter = new OpenAI2GeminiConverter();
      const params: OpenAIChatCompletionParams = {
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        service_tier: 'priority',
        temperature: 0.5,
        top_p: 0.8,
        frequency_penalty: 0.3,
        seed: 42,
      };

      const request = converter.convertRequest(params) as Record<string, unknown>;

      // All extras should be silently dropped by the Gemini converter.
      expect(request.service_tier).toBeUndefined();
      expect(request.temperature).toBeUndefined();
      expect(request.top_p).toBeUndefined();
      expect(request.frequency_penalty).toBeUndefined();
      expect(request.seed).toBeUndefined();
    });

    it('accepts an experimental/forward-compat param', () => {
      const converter = new OpenAI2GeminiConverter();
      const params: OpenAIChatCompletionParams = {
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        // Simulating a future OpenAI param the converter has never seen
        new_param_flag: 'experimental',
      };

      expect(() => converter.convertRequest(params)).not.toThrow();
    });

    it('accepts an empty object for extra params', () => {
      const converter = new OpenAI2GeminiConverter();
      const params: OpenAIChatCompletionParams = {
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
      };

      const request = converter.convertRequest(params);

      expect(request.model).toBe('gemini-1.5-flash');
      expect(request.contents).toEqual([{ role: 'user', parts: [{ text: 'hello' }] }]);
    });

    it('does not regress image generation when extras are present', () => {
      const converter = new OpenAI2GeminiConverter();
      const params: OpenAIChatCompletionParams = {
        model: 'gemini-3-pro-image-preview',
        messages: [{ role: 'user', content: 'Generate image: a cat' }],
        service_tier: 'flex',
        temperature: 0.7,
      };

      const request = converter.convertRequest(params);

      // The image generation behavior must be preserved regardless of extras.
      expect(request.generationConfig?.responseModalities).toEqual(['IMAGE', 'TEXT']);
    });
  });
});
