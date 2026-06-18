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

export interface GeminiClientConfig {
  model?: string;
  baseURL?: string;
  requestOptions?: Record<string, unknown>;
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

  async generateContent(prompt: string, config?: GenerateContentParameters['config']): Promise<unknown> {
    return await this.executeWithRetry(async (client) => {
      const request: GenerateContentParameters = {
        model: this.config.model || 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
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

    return await this.executeWithRetry(async (client) => {
      const geminiRequest = this.converter.convertRequest(params);
      const { generationConfig, ...generateContentRequest } = geminiRequest;
      const request: GenerateContentParameters = {
        ...generateContentRequest,
        ...(generationConfig ? { config: generationConfig } : {}),
      };
      const geminiResponse = await client.models.generateContent(request);
      return this.converter.convertResponse(geminiResponse, params.model);
    });
  }
}
