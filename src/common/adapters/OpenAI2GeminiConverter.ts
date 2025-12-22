/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProtocolConverter, ConverterConfig } from './ProtocolConverter';

// OpenAI types - compatible with actual OpenAI SDK types
export interface OpenAIChatCompletionParams {
  model: string;
  messages: Array<{
    role: string;
    content:
      | string
      | Array<{
          type: string;
          text?: string;
          image_url?: { url: string; detail?: string };
        }>;
  }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: any;
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      images?: Array<{
        type: 'image_url';
        image_url: { url: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Gemini types
export interface GeminiRequest {
  model: string;
  contents: Array<{
    parts: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
    }>;
  }>;
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description?: string;
      parameters?: any;
    }>;
  }>;
}

/**
 * Converter for transforming OpenAI chat completion format to/from Gemini format
 */
export class OpenAI2GeminiConverter implements ProtocolConverter<OpenAIChatCompletionParams, GeminiRequest, OpenAIChatCompletionResponse> {
  private readonly config: ConverterConfig;

  constructor(config: ConverterConfig = {}) {
    this.config = {
      defaultModel: 'gemini-1.5-flash',
      ...config,
    };
  }

  /**
   * Convert OpenAI chat completion params to Gemini request format
   */
  convertRequest(params: OpenAIChatCompletionParams): GeminiRequest {
    const message = params.messages[0];
    if (!message || !message.content) {
      throw new Error('Invalid message format for Gemini conversion');
    }

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    // Handle both string content and array content
    if (typeof message.content === 'string') {
      parts.push({ text: message.content });
    } else {
      for (const part of message.content) {
        if (part.type === 'text' && part.text) {
          parts.push({ text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const imageUrl = part.image_url.url;

          if (imageUrl.startsWith('data:')) {
            // Handle base64 data URLs
            const [mimeInfo, base64Data] = imageUrl.split(',');
            const mimeType = mimeInfo.match(/data:(.*?);base64/)?.[1] || 'image/png';

            parts.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          } else if (imageUrl.startsWith('http')) {
            // For HTTP URLs, we need to fetch and convert to base64
            // Gemini prefers inlineData over fileData for better reliability
            throw new Error('HTTP image URLs not yet supported in Gemini integration. Please use base64 data URLs.');
          }
        }
      }
    }

    // Use image generation model if request seems to be for image generation
    const isImageGeneration = parts.some((part) => part.text && (part.text.toLowerCase().includes('generate image') || part.text.toLowerCase().includes('create image') || part.text.toLowerCase().includes('draw') || part.text.toLowerCase().includes('make image')));

    const model = isImageGeneration ? 'gemini-2.5-flash-image-preview' : this.config.defaultModel || params.model;

    const request: GeminiRequest = {
      model,
      contents: [{ parts }],
    };

    // Add tools if present in OpenAI request
    if (params.tools && params.tools.length > 0) {
      request.tools = [
        {
          functionDeclarations: params.tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters, // Keep as native object, don't stringify
          })),
        },
      ];
    }

    return request;
  }

  /**
   * Convert Gemini response back to OpenAI chat completion format
   */
  convertResponse(geminiResponse: any, requestedModel: string): OpenAIChatCompletionResponse {
    const candidates = geminiResponse.candidates || [];
    const candidate = candidates[0];

    if (!candidate) {
      return {
        id: `gemini-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: requestedModel,
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    }

    let content = '';
    const images: Array<{ type: 'image_url'; image_url: { url: string } }> = [];

    // Process all parts in the response
    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          content += part.text;
        }
        if (part.inlineData) {
          images.push({
            type: 'image_url',
            image_url: {
              url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            },
          });
        }
      }
    }

    // Build OpenAI-compatible response
    const choice: any = {
      index: 0,
      message: {
        role: 'assistant',
        content: content || 'Image generated successfully.',
      },
      finish_reason: this.mapFinishReason(candidate.finishReason),
    };

    // Add images array if there are generated images (for img-gen.ts compatibility)
    if (images.length > 0) {
      choice.message.images = images;
    }

    return {
      id: `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [choice],
      usage: {
        prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
        completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  /**
   * Map Gemini finish reasons to OpenAI format
   */
  private mapFinishReason(geminiReason?: string): string {
    switch (geminiReason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
