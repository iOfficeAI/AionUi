import OpenAI from 'openai';
import { AuthType } from '@office-ai/aioncli-core';
import type { RotatingApiClientOptions } from '../RotatingApiClient';
import { RotatingApiClient } from '../RotatingApiClient';

export interface OpenAIClientConfig {
  baseURL?: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
  httpAgent?: unknown;
}

export class OpenAIRotatingClient extends RotatingApiClient<OpenAI> {
  private readonly baseConfig: OpenAIClientConfig;

  constructor(apiKeys: string, config: OpenAIClientConfig = {}, options: RotatingApiClientOptions = {}) {
    const createClient = (apiKey: string) => {
      const cleanedApiKey = apiKey.replace(/[\s\r\n\t]/g, '').trim();
      const openaiConfig: any = {
        baseURL: config.baseURL,
        apiKey: cleanedApiKey,
        defaultHeaders: config.defaultHeaders,
      };

      if (config.httpAgent) {
        openaiConfig.httpAgent = config.httpAgent;
      }

      return new OpenAI(openaiConfig);
    };

    super(apiKeys, AuthType.USE_OPENAI, createClient, options);
    this.baseConfig = config;
  }

  protected getCurrentApiKey(): string | undefined {
    if (this.apiKeyManager?.hasMultipleKeys()) {
      // For OpenAI, try to get from environment first
      return process.env.OPENAI_API_KEY || this.apiKeyManager.getCurrentKey();
    }
    // Use base class method for single key
    return super.getCurrentApiKey();
  }

  // Convenience methods for common OpenAI operations
  async createChatCompletion(params: OpenAI.Chat.Completions.ChatCompletionCreateParams, options?: OpenAI.RequestOptions): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return await this.executeWithRetry((client) => {
      return client.chat.completions.create(params, options) as Promise<OpenAI.Chat.Completions.ChatCompletion>;
    });
  }

  async createImage(params: OpenAI.Images.ImageGenerateParams, options?: OpenAI.RequestOptions): Promise<OpenAI.Images.ImagesResponse> {
    return await this.executeWithRetry((client) => {
      return client.images.generate(params, options) as Promise<OpenAI.Images.ImagesResponse>;
    });
  }

  async createEmbedding(params: OpenAI.Embeddings.EmbeddingCreateParams, options?: OpenAI.RequestOptions): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
    return await this.executeWithRetry((client) => {
      return client.embeddings.create(params, options);
    });
  }
}
