/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, type GenerateContentParameters, type GoogleGenAIOptions } from '@google/genai';
import { AuthType } from '@office-ai/aioncli-core';
import type { RotatingApiClientOptions } from './RotatingApiClient';
import { RotatingApiClient } from './RotatingApiClient';
import {
  OpenAI2GeminiConverter,
  type OpenAIChatCompletionParams,
  type OpenAIChatCompletionResponse,
} from './OpenAI2GeminiConverter';
import {
  evaluateCommandEveEgressBoundary,
  redactCommandEveSensitiveText,
  type CommandEveEgressPolicyAction,
} from './egressBoundaryCore';

export interface GeminiClientConfig {
  model?: string;
  baseURL?: string;
  requestOptions?: Record<string, unknown>;
  commandEveEgressPolicyAction?: CommandEveEgressPolicyAction;
  commandEveEgressProviderName?: string;
}

export class GeminiRotatingClient extends RotatingApiClient<GoogleGenAI> {
  private readonly config: GeminiClientConfig;
  private readonly converter: OpenAI2GeminiConverter;

  constructor(
    apiKeys: string,
    config: GeminiClientConfig = {},
    options: RotatingApiClientOptions = {},
    authType: AuthType = AuthType.USE_GEMINI
  ) {
    const createClient = (apiKey: string) => {
      const cleanedApiKey = apiKey.replace(/[\s\r\n\t]/g, '').trim();
      const clientConfig: GoogleGenAIOptions = {
        apiKey: cleanedApiKey === '' ? undefined : cleanedApiKey,
        vertexai: authType === AuthType.USE_VERTEX_AI,
      };
      if (config.baseURL) {
        clientConfig.httpOptions = {
          ...clientConfig.httpOptions,
          baseUrl: config.baseURL,
        };
      }
      return new GoogleGenAI(clientConfig);
    };

    super(apiKeys, authType, createClient, options);
    this.config = config;
    this.converter = new OpenAI2GeminiConverter({
      defaultModel: config.model || 'gemini-1.5-flash',
    });
  }

  protected getCurrentApiKey(): string | undefined {
    if (this.apiKeyManager?.hasMultipleKeys()) {
      return process.env.GEMINI_API_KEY || this.apiKeyManager.getCurrentKey();
    }
    return super.getCurrentApiKey();
  }

  private openAiMessageText(message: OpenAIChatCompletionParams['messages'][number]): string {
    const content = message.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  private redactOpenAiParams(params: OpenAIChatCompletionParams): OpenAIChatCompletionParams {
    return {
      ...params,
      messages: params.messages.map((message) => {
        const content = message.content;
        if (typeof content === 'string') {
          return { ...message, content: redactCommandEveSensitiveText(content) };
        }
        if (!Array.isArray(content)) return message;
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

  /**
   * Fail-closed Command EVE egress boundary for the Gemini/Vertex cloud path.
   * Mirrors AnthropicRotatingClient/OpenAIRotatingClient: evaluate the outbound
   * text, THROW on decision==='block' before any Gemini egress, and redact in
   * place when the policy is 'redact'. No-op when no policy action is injected.
   */
  private async enforceCommandEveGeminiEgressBoundary(text: string, model: string): Promise<void> {
    const policyAction = this.config.commandEveEgressPolicyAction;
    if (!policyAction) return;
    const boundary = await evaluateCommandEveEgressBoundary({
      text,
      provider: {
        kind: 'cloud',
        name: this.config.commandEveEgressProviderName || 'gemini',
        model: model || this.config.model || '',
        baseUrl: this.config.baseURL,
      },
      policyAction,
    });
    if (boundary.decision === 'block') {
      throw new Error(
        `Command EVE blocked sensitive data before Gemini model egress (${boundary.receipt.finding_count} finding(s)).`
      );
    }
  }

  async generateContent(prompt: string, config?: GenerateContentParameters['config']): Promise<unknown> {
    const model = this.config.model || 'gemini-1.5-flash';
    await this.enforceCommandEveGeminiEgressBoundary(prompt, model);
    const safePrompt = this.config.commandEveEgressPolicyAction === 'redact' ? redactCommandEveSensitiveText(prompt) : prompt;
    return await this.executeWithRetry(async (client) => {
      const request: GenerateContentParameters = {
        model,
        contents: [{ role: 'user', parts: [{ text: safePrompt }] }],
        ...(config ? { config } : {}),
      };
      return await client.models.generateContent(request);
    });
  }

  async createChatCompletion(
    params: OpenAIChatCompletionParams,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<OpenAIChatCompletionResponse> {
    if (options?.signal?.aborted) {
      throw new Error('Request was aborted');
    }

    await this.enforceCommandEveGeminiEgressBoundary(
      params.messages.map((message) => this.openAiMessageText(message)).join('\n\n'),
      params.model
    );
    const safeParams = this.config.commandEveEgressPolicyAction === 'redact' ? this.redactOpenAiParams(params) : params;

    return await this.executeWithRetry(async (client) => {
      const geminiRequest = this.converter.convertRequest(safeParams);
      const { generationConfig, ...generateContentRequest } = geminiRequest;
      const request: GenerateContentParameters = {
        ...generateContentRequest,
        ...(generationConfig ? { config: generationConfig } : {}),
      };
      const geminiResponse = await client.models.generateContent(request);
      return this.converter.convertResponse(geminiResponse, safeParams.model);
    });
  }
}
