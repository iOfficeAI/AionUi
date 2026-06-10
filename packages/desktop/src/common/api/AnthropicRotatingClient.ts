/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import Anthropic, { type ClientOptions as AnthropicClientOptions_ } from '@anthropic-ai/sdk';
import { AuthType } from '@office-ai/aioncli-core';
import type { RotatingApiClientOptions } from './RotatingApiClient';
import { RotatingApiClient } from './RotatingApiClient';
import {
  OpenAI2AnthropicConverter,
  type OpenAIChatCompletionParams,
  type OpenAIChatCompletionResponse,
} from './OpenAI2AnthropicConverter';
import {
  evaluateCommandEveEgressBoundary,
  redactCommandEveSensitiveText,
  type CommandEveEgressPolicyAction,
} from './egressBoundaryCore';

export interface AnthropicClientConfig {
  model?: string;
  baseURL?: string;
  timeout?: number;
  commandEveEgressPolicyAction?: CommandEveEgressPolicyAction;
  commandEveEgressProviderName?: string;
}

type RedactableBlock = { [key: string]: any };

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

  private openAiMessageText(message: OpenAIChatCompletionParams['messages'][number]): string {
    const content = message.content;
    if (typeof content === 'string') return content;
    return content
      .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  private anthropicBlockText(block: RedactableBlock): string {
    if ('text' in block && typeof block.text === 'string') return block.text;
    if ('content' in block) {
      const content = block.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map((nestedBlock) => this.anthropicBlockText(nestedBlock as RedactableBlock)).filter(Boolean).join('\n');
      }
    }
    return '';
  }

  private anthropicMessageText(message: Anthropic.MessageParam): string {
    const content = message.content;
    if (typeof content === 'string') return content;
    return content.map((block) => this.anthropicBlockText(block)).filter(Boolean).join('\n');
  }

  private async enforceCommandEveAnthropicEgressBoundary<T>(
    request: T,
    text: string
  ): Promise<T> {
    const policyAction = this.config.commandEveEgressPolicyAction;
    if (!policyAction) return request;
    const boundary = await evaluateCommandEveEgressBoundary({
      text,
      provider: {
        kind: 'cloud',
        name: this.config.commandEveEgressProviderName || 'anthropic',
        model: String(this.requestModel(request) || this.config.model || ''),
        baseUrl: this.config.baseURL,
      },
      policyAction,
    });
    if (boundary.decision === 'block') {
      throw new Error(
        `Command EVE blocked sensitive data before Anthropic model egress (${boundary.receipt.finding_count} finding(s)).`
      );
    }
    if (boundary.decision !== 'redact') return request;
    return this.redactRequest(request);
  }

  private requestModel(request: unknown): unknown {
    return request && typeof request === 'object' && 'model' in request ? (request as { model?: unknown }).model : undefined;
  }

  private redactOpenAiRequest(params: OpenAIChatCompletionParams): OpenAIChatCompletionParams {
    return {
      ...params,
      messages: params.messages.map((message) => {
        const content = message.content;
        if (typeof content === 'string') {
          return { ...message, content: redactCommandEveSensitiveText(content) };
        }
        return {
          ...message,
          content: content.map((part) =>
            part.type === 'text' && typeof part.text === 'string'
              ? { ...part, text: redactCommandEveSensitiveText(part.text) }
              : part
          ),
        };
      }),
    };
  }

  private redactAnthropicRequest(
    request: Anthropic.MessageCreateParamsNonStreaming
  ): Anthropic.MessageCreateParamsNonStreaming {
    return {
      ...request,
      system: this.redactAnthropicSystem(request.system),
      messages: request.messages.map((message) => ({
        ...message,
        content:
          typeof message.content === 'string'
            ? redactCommandEveSensitiveText(message.content)
            : (message.content.map((block) => this.redactAnthropicBlock(block)) as Anthropic.ContentBlockParam[]),
      })),
    };
  }

  private redactAnthropicSystem(system: Anthropic.MessageCreateParamsNonStreaming['system']) {
    if (typeof system === 'string') return redactCommandEveSensitiveText(system);
    if (Array.isArray(system)) {
      return system.map((block) => this.redactAnthropicBlock(block) as unknown as Anthropic.TextBlockParam);
    }
    return system;
  }

  private redactAnthropicBlock<T extends RedactableBlock>(block: T): T {
    if ('text' in block && typeof block.text === 'string') {
      return { ...block, text: redactCommandEveSensitiveText(block.text) };
    }
    if ('content' in block) {
      const content = block.content;
      if (typeof content === 'string') {
        return { ...block, content: redactCommandEveSensitiveText(content) };
      }
      if (Array.isArray(content)) {
        return {
          ...block,
          content: content.map((nestedBlock) =>
            nestedBlock && typeof nestedBlock === 'object'
              ? this.redactAnthropicBlock(nestedBlock as RedactableBlock)
              : nestedBlock
          ),
        };
      }
    }
    return block;
  }

  private redactRequest<T>(request: T): T {
    if (request && typeof request === 'object' && 'max_tokens' in request) {
      return this.redactAnthropicRequest(request as unknown as Anthropic.MessageCreateParamsNonStreaming) as T;
    }
    return this.redactOpenAiRequest(request as OpenAIChatCompletionParams) as T;
  }

  /**
   * OpenAI-compatible createChatCompletion method for unified interface
   */
  async createChatCompletion(
    params: OpenAIChatCompletionParams,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<OpenAIChatCompletionResponse> {
    // Handle request cancellation
    if (options?.signal?.aborted) {
      throw new Error('Request was aborted');
    }

    const safeParams = await this.enforceCommandEveAnthropicEgressBoundary(
      params,
      params.messages.map((message) => this.openAiMessageText(message)).join('\n\n')
    );

    return await this.executeWithRetry(async (client) => {
      // Convert OpenAI format to Anthropic format using converter
      const anthropicRequest = this.converter.convertRequest(safeParams);

      // Call Anthropic API
      const anthropicResponse = await client.messages.create(anthropicRequest);

      // Convert Anthropic response back to OpenAI format using converter
      return this.converter.convertResponse(anthropicResponse, safeParams.model);
    });
  }

  /**
   * Direct Anthropic API call for native usage
   */
  async createMessage(request: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    const safeRequest = await this.enforceCommandEveAnthropicEgressBoundary(
      request,
      [
        typeof request.system === 'string'
          ? request.system
          : Array.isArray(request.system)
            ? request.system.map((block) => this.anthropicBlockText(block as RedactableBlock)).join('\n')
            : '',
        request.messages.map((message) => this.anthropicMessageText(message)).join('\n\n'),
      ]
        .filter(Boolean)
        .join('\n\n')
    );
    return await this.executeWithRetry(async (client) => {
      return await client.messages.create(safeRequest);
    });
  }
}
