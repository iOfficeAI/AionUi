/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProtocolConverter, ConverterConfig } from './ProtocolConverter';

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
      parameters?: unknown;
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

export interface GeminiRequest {
  model: string;
  contents: Array<{
    role?: string;
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
      parameters?: unknown;
    }>;
  }>;
  generationConfig?: {
    responseModalities?: string[];
  };
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export function sanitizeGeminiFunctionName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (sanitized.length > 0 && /^[0-9]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized || '_unnamed';
}

export class OpenAI2GeminiConverter implements ProtocolConverter<
  OpenAIChatCompletionParams,
  GeminiRequest,
  OpenAIChatCompletionResponse
> {
  private readonly config: ConverterConfig;

  constructor(config: ConverterConfig = {}) {
    this.config = {
      defaultModel: 'gemini-1.5-flash',
      ...config,
    };
  }

  convertRequest(params: OpenAIChatCompletionParams): GeminiRequest {
    const message = params.messages[0];
    if (!message || !message.content) {
      throw new Error('Invalid message format for Gemini conversion');
    }

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (typeof message.content === 'string') {
      parts.push({ text: message.content });
    } else {
      for (const part of message.content) {
        if (part.type === 'text' && part.text) {
          parts.push({ text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const imageUrl = part.image_url.url;
          if (imageUrl.startsWith('data:')) {
            const [mimeInfo, base64Data] = imageUrl.split(',');
            const mimeType = mimeInfo.match(/data:(.*?);base64/)?.[1] || 'image/png';
            parts.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          } else if (imageUrl.startsWith('http')) {
            throw new Error('HTTP image URLs are not supported in Gemini integration. Please use base64 data URLs.');
          }
        }
      }
    }

    const isImageGeneration = parts.some((part) => {
      const text = part.text?.toLowerCase();
      return (
        text &&
        (text.includes('generate image') ||
          text.includes('create image') ||
          text.includes('draw') ||
          text.includes('make image'))
      );
    });

    const request: GeminiRequest = {
      model: params.model || this.config.defaultModel || 'gemini-1.5-flash',
      contents: [{ role: 'user', parts }],
    };

    if (isImageGeneration) {
      request.generationConfig = {
        responseModalities: ['IMAGE', 'TEXT'],
      };
    }

    if (params.tools && params.tools.length > 0) {
      request.tools = [
        {
          functionDeclarations: params.tools.map((tool) => ({
            name: sanitizeGeminiFunctionName(tool.function.name),
            description: tool.function.description,
            parameters: tool.function.parameters,
          })),
        },
      ];
    }

    return request;
  }

  convertResponse(geminiResponse: GeminiResponse, requestedModel: string): OpenAIChatCompletionResponse {
    const candidate = geminiResponse.candidates?.[0];

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

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          content += part.text;
        }
        if (part.inlineData) {
          images.push({
            type: 'image_url',
            image_url: {
              url: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data || ''}`,
            },
          });
        }
      }
    }

    return {
      id: `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content || 'Image generated successfully.',
            ...(images.length > 0 ? { images } : {}),
          },
          finish_reason: this.mapFinishReason(candidate.finishReason),
        },
      ],
      usage: {
        prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
        completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  private mapFinishReason(geminiReason?: string): string {
    switch (geminiReason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
