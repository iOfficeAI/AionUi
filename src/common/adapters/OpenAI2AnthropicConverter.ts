/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProtocolConverter, ConverterConfig } from './ProtocolConverter';
import type Anthropic from '@anthropic-ai/sdk';

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
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
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

// Anthropic types
export type AnthropicMessageRequest = Anthropic.MessageCreateParamsNonStreaming;
export type AnthropicMessageResponse = Anthropic.Message;

/**
 * Converter for transforming OpenAI chat completion format to/from Anthropic format
 */
export class OpenAI2AnthropicConverter implements ProtocolConverter<OpenAIChatCompletionParams, AnthropicMessageRequest, OpenAIChatCompletionResponse> {
  private readonly config: ConverterConfig;

  constructor(config: ConverterConfig = {}) {
    this.config = {
      defaultModel: 'claude-sonnet-4-20250514',
      ...config,
    };
  }

  /**
   * Convert OpenAI chat completion params to Anthropic message request format
   */
  convertRequest(params: OpenAIChatCompletionParams): AnthropicMessageRequest {
    // Extract system message (Anthropic uses separate system parameter)
    let systemMessage: string | undefined;
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of params.messages) {
      if (msg.role === 'system') {
        // Anthropic uses a separate system parameter
        systemMessage = this.extractTextContent(msg.content);
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        const content = this.convertMessageContent(msg.content);
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content,
        });
      }
    }

    // Ensure messages alternate between user and assistant
    // Anthropic requires the first message to be from user
    const validatedMessages = this.ensureAlternatingMessages(messages);

    const request: AnthropicMessageRequest = {
      model: this.config.defaultModel || params.model,
      max_tokens: params.max_tokens || 4096,
      messages: validatedMessages,
    };

    // Add system message if present
    if (systemMessage) {
      request.system = systemMessage;
    }

    // Add optional parameters
    if (params.temperature !== undefined) {
      request.temperature = params.temperature;
    }
    if (params.top_p !== undefined) {
      request.top_p = params.top_p;
    }
    if (params.stop) {
      request.stop_sequences = Array.isArray(params.stop) ? params.stop : [params.stop];
    }

    // Convert tools if present
    if (params.tools && params.tools.length > 0) {
      request.tools = params.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description || '',
        input_schema: (tool.function.parameters as Anthropic.Tool.InputSchema) || { type: 'object', properties: {} },
      }));
    }

    return request;
  }

  /**
   * Convert Anthropic message response to OpenAI chat completion format
   */
  convertResponse(anthropicResponse: AnthropicMessageResponse, requestedModel: string): OpenAIChatCompletionResponse {
    let content = '';
    const images: Array<{ type: 'image_url'; image_url: { url: string } }> = [];

    // Process all content blocks in the response
    for (const block of anthropicResponse.content) {
      if (block.type === 'text') {
        content += block.text;
      }
      // Note: Anthropic doesn't return images in the same way as image generation models
    }

    return {
      id: anthropicResponse.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content || '',
            ...(images.length > 0 ? { images } : {}),
          },
          finish_reason: this.mapStopReason(anthropicResponse.stop_reason),
        },
      ],
      usage: {
        prompt_tokens: anthropicResponse.usage.input_tokens,
        completion_tokens: anthropicResponse.usage.output_tokens,
        total_tokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens,
      },
    };
  }

  /**
   * Extract text content from OpenAI message content
   */
  private extractTextContent(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): string {
    if (typeof content === 'string') {
      return content;
    }

    return content
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text!)
      .join('\n');
  }

  /**
   * Convert OpenAI message content to Anthropic content format
   */
  private convertMessageContent(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): Anthropic.ContentBlockParam[] | string {
    if (typeof content === 'string') {
      return content;
    }

    const contentBlocks: Anthropic.ContentBlockParam[] = [];

    for (const part of content) {
      if (part.type === 'text' && part.text) {
        contentBlocks.push({
          type: 'text',
          text: part.text,
        });
      } else if (part.type === 'image_url' && part.image_url?.url) {
        const imageUrl = part.image_url.url;

        if (imageUrl.startsWith('data:')) {
          // Handle base64 data URLs
          const [mimeInfo, base64Data] = imageUrl.split(',');
          const mimeType = mimeInfo.match(/data:(.*?);base64/)?.[1] || 'image/png';

          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64Data,
            },
          });
        } else if (imageUrl.startsWith('http')) {
          // Anthropic supports URL-based images
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'url',
              url: imageUrl,
            },
          });
        }
      }
    }

    return contentBlocks.length === 1 && contentBlocks[0].type === 'text' ? (contentBlocks[0] as Anthropic.TextBlockParam).text : contentBlocks;
  }

  /**
   * Ensure messages alternate between user and assistant
   * Anthropic requires the first message to be from user
   */
  private ensureAlternatingMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
    if (messages.length === 0) {
      return [];
    }

    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      const lastRole = result.length > 0 ? result[result.length - 1].role : null;

      // If same role as last message, merge content
      if (lastRole === msg.role) {
        const lastMsg = result[result.length - 1];
        const lastContent = lastMsg.content;
        const newContent = msg.content;

        // Merge contents
        if (typeof lastContent === 'string' && typeof newContent === 'string') {
          lastMsg.content = lastContent + '\n' + newContent;
        } else {
          // Convert to array and merge
          const lastArray = typeof lastContent === 'string' ? [{ type: 'text' as const, text: lastContent }] : lastContent;
          const newArray = typeof newContent === 'string' ? [{ type: 'text' as const, text: newContent }] : newContent;
          lastMsg.content = [...lastArray, ...newArray];
        }
      } else {
        result.push({ ...msg });
      }
    }

    // Ensure first message is from user
    if (result.length > 0 && result[0].role !== 'user') {
      result.unshift({
        role: 'user',
        content: 'Continue the conversation.',
      });
    }

    return result;
  }

  /**
   * Map Anthropic stop reasons to OpenAI finish reasons
   */
  private mapStopReason(stopReason: string | null): string {
    switch (stopReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}
