/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import Anthropic, { type ClientOptions as AnthropicClientOptions_ } from '@anthropic-ai/sdk';
import { AuthType } from '@office-ai/aioncli-core';
import type { RotatingApiClientOptions } from '../RotatingApiClient';
import { RotatingApiClient } from '../RotatingApiClient';
import { OpenAI2AnthropicConverter, type OpenAIChatCompletionParams, type OpenAIChatCompletionResponse } from './OpenAI2AnthropicConverter';

export interface AnthropicClientConfig {
  model?: string;
  baseURL?: string;
  timeout?: number;
}

export class AnthropicRotatingClient extends RotatingApiClient<Anthropic> {
  private readonly config: AnthropicClientConfig;
  private readonly converter: OpenAI2AnthropicConverter;

  constructor(apiKeys: string, config: AnthropicClientConfig = {}, options: RotatingApiClientOptions = {}) {
    const createClient = (apiKey: string) => {
      const cleanedApiKey = apiKey.replace(/[\s\r\n\t]/g, '').trim();

      const clientConfig: AnthropicClientOptions_ = {
        apiKey: cleanedApiKey,
      };

      if (config.baseURL) {
        clientConfig.baseURL = config.baseURL;
      }

      if (config.timeout) {
        clientConfig.timeout = config.timeout;
      }

      return new Anthropic(clientConfig);
    };

    super(apiKeys, AuthType.USE_ANTHROPIC, createClient, options);
    this.config = config;
    this.converter = new OpenAI2AnthropicConverter({
      defaultModel: config.model || 'claude-sonnet-4-20250514',
    });
  }

  protected getCurrentApiKey(): string | undefined {
    if (this.apiKeyManager?.hasMultipleKeys()) {
      // For Anthropic, try to get from environment first
      return process.env.ANTHROPIC_API_KEY || this.apiKeyManager.getCurrentKey();
    }
    // Use base class method for single key
    return super.getCurrentApiKey();
  }

  /**
   * OpenAI-compatible createChatCompletion method for unified interface
   */
  async createChatCompletion(params: OpenAIChatCompletionParams, options?: { signal?: AbortSignal; timeout?: number }): Promise<OpenAIChatCompletionResponse> {
    // Handle request cancellation
    if (options?.signal?.aborted) {
      throw new Error('Request was aborted');
    }

    return await this.executeWithRetry(async (client) => {
      // Convert OpenAI format to Anthropic format using converter
      const anthropicRequest = this.converter.convertRequest(params);

      // Call Anthropic API
      const anthropicResponse = await client.messages.create(anthropicRequest);

      // Convert Anthropic response back to OpenAI format using converter
      return this.converter.convertResponse(anthropicResponse, params.model);
    });
  }

  /**
   * Direct Anthropic API call for native usage
   */
  async createMessage(request: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    return await this.executeWithRetry(async (client) => {
      return await client.messages.create(request);
    });
  }
}
