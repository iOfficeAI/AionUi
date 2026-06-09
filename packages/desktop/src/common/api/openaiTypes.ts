/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAI ChatCompletion-style params accepted by all rotating clients.
 *
 * Fields explicitly handled by the converters:
 * - Gemini: `model`, `messages`, `tools`, `tool_choice`
 * - Anthropic: `model`, `messages`, `max_tokens`, `temperature`, `top_p`,
 *   `stop`, `stream`, `tools`, `tool_choice`
 *
 * Any other OpenAI SDK field (e.g. `service_tier`, `frequency_penalty`,
 * `seed`, `logit_bias`, `parallel_tool_calls`, etc.) is accepted via the
 * index signature and forwarded as-is to the OpenAI SDK. Non-OpenAI
 * providers (Gemini, Anthropic) silently drop these fields — pass-through
 * is a no-op for them.
 *
 * The index signature is typed `unknown` (not `any`) per project lint
 * rules; callers can still spread a typed OpenAI object safely.
 */
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
  /**
   * Pass-through for any additional OpenAI SDK parameters not enumerated
   * above. Forwarded to the OpenAI SDK by `OpenAIRotatingClient`; ignored
   * by Gemini/Anthropic converters.
   */
  [key: string]: unknown;
}

/**
 * OpenAI ChatCompletion-style response returned by the rotating clients
 * regardless of upstream provider. Providers map their native response
 * into this shape so callers can use a single response type.
 */
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
