/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatCompletionRequest } from './comboRouter';

export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
};

export type AnthropicPayload = {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
};

export type AnthropicStreamState = {
  id: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thoughtTokens: number;
};

/**
 * Checks whether the given platform and baseUrl point to the native Anthropic Messages API.
 */
export function isAnthropicNative(baseUrl: string, platform: string): boolean {
  if (platform !== 'anthropic') return false;
  const clean = baseUrl.toLowerCase();
  if (clean.includes('openrouter') || clean.includes('openai') || clean.includes('/chat/completions')) {
    return false;
  }
  return clean.includes('anthropic.com') || clean.includes('/messages');
}

/**
 * Converts an OpenAI-compatible chat completion request to Anthropic Messages payload.
 */
export function convertOpenAiToAnthropicPayload(req: ChatCompletionRequest, model: string): AnthropicPayload {
  const systemParts: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];

  const rawMessages = Array.isArray(req.messages) ? req.messages : [];

  for (const m of rawMessages) {
    if (!m || typeof m !== 'object') continue;
    const msg = m as { role?: string; content?: unknown };
    const role = msg.role || 'user';

    if (role === 'system') {
      if (typeof msg.content === 'string') {
        systemParts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
            systemParts.push(part.text);
          }
        }
      }
      continue;
    }

    const anthropicRole: 'user' | 'assistant' = role === 'assistant' ? 'assistant' : 'user';
    let contentStr = '';

    if (typeof msg.content === 'string') {
      contentStr = msg.content;
    } else if (Array.isArray(msg.content)) {
      contentStr = msg.content
        .map((p) => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object' && 'text' in p && typeof p.text === 'string') {
            return p.text;
          }
          return '';
        })
        .join('');
    }

    // Merge consecutive messages with the same role (Anthropic requires strict alternating roles)
    if (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role === anthropicRole) {
      const prev = anthropicMessages[anthropicMessages.length - 1];
      if (typeof prev.content === 'string') {
        prev.content = `${prev.content}\n\n${contentStr}`;
      }
    } else {
      anthropicMessages.push({
        role: anthropicRole,
        content: contentStr,
      });
    }
  }

  // Ensure first message is from 'user'
  if (anthropicMessages.length === 0 || anthropicMessages[0].role !== 'user') {
    anthropicMessages.unshift({
      role: 'user',
      content: '...',
    });
  }

  const payload: AnthropicPayload = {
    model,
    messages: anthropicMessages,
    max_tokens: typeof req.max_tokens === 'number' ? req.max_tokens : 4096,
    stream: Boolean(req.stream),
  };

  if (systemParts.length > 0) {
    payload.system = systemParts.join('\n\n');
  }

  if (typeof req.temperature === 'number') {
    payload.temperature = req.temperature;
  }

  return payload;
}

/**
 * Converts a non-streaming Anthropic response to OpenAI chat completion format.
 */
export function convertAnthropicToOpenAiResponse(
  data: Record<string, unknown>,
  targetModel: string
): Record<string, unknown> {
  const contentBlocks = Array.isArray(data.content) ? data.content : [];
  let text = '';
  for (const block of contentBlocks) {
    if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') {
      text += block.text;
    }
  }

  const usage = (data.usage as Record<string, unknown>) || {};
  const promptTokens = Number(usage.input_tokens) || 0;
  const completionTokens = Number(usage.output_tokens) || 0;
  const cachedTokens = Number(usage.cache_read_input_tokens) || 0;

  return {
    id: `chatcmpl-${(data.id as string) || Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: targetModel,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text,
        },
        finish_reason: data.stop_reason === 'max_tokens' ? 'length' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      prompt_tokens_details: {
        cached_tokens: cachedTokens,
      },
    },
  };
}

/**
 * Parses an Anthropic SSE line and emits corresponding OpenAI SSE chunk(s).
 */
export function transformAnthropicSseLine(
  line: string,
  state: AnthropicStreamState,
  onOpenAiChunk: (chunk: string) => void
): void {
  if (!line.startsWith('data: ')) return;
  const rawData = line.slice(6).trim();
  if (!rawData || rawData === '[DONE]') return;

  try {
    const event = JSON.parse(rawData);

    if (event.type === 'message_start' && event.message) {
      state.id = event.message.id || state.id;
      if (event.message.usage) {
        state.inputTokens = Number(event.message.usage.input_tokens) || state.inputTokens;
        state.cachedTokens = Number(event.message.usage.cache_read_input_tokens) || state.cachedTokens;
      }
    } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const text = event.delta.text || '';
      const chunkObj = {
        id: `chatcmpl-${state.id}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: state.model,
        choices: [
          {
            index: 0,
            delta: { content: text },
            finish_reason: null as string | null,
          },
        ],
      };
      onOpenAiChunk(`data: ${JSON.stringify(chunkObj)}\n\n`);
    } else if (event.type === 'message_delta') {
      if (event.usage) {
        state.outputTokens = Number(event.usage.output_tokens) || state.outputTokens;
      }
      const finishReason = event.delta?.stop_reason === 'max_tokens' ? 'length' : 'stop';
      const chunkObj = {
        id: `chatcmpl-${state.id}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: state.model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason,
          },
        ],
        usage: {
          prompt_tokens: state.inputTokens,
          completion_tokens: state.outputTokens,
          total_tokens: state.inputTokens + state.outputTokens,
          prompt_tokens_details: {
            cached_tokens: state.cachedTokens,
          },
        },
      };
      onOpenAiChunk(`data: ${JSON.stringify(chunkObj)}\n\n`);
    } else if (event.type === 'message_stop') {
      onOpenAiChunk('data: [DONE]\n\n');
    }
  } catch {
    // Ignore malformed SSE lines
  }
}
