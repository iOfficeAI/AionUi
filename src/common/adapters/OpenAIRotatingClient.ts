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
    // Debug: Log request info for image generation requests
    const hasImageContent = Array.isArray(params.messages) && params.messages.some((msg) => Array.isArray(msg.content) && msg.content.some((c: any) => c.type === 'image_url'));
    const isImageGeneration = params.model?.toLowerCase().includes('image');
    if (hasImageContent || isImageGeneration) {
      console.log(`[OpenAIRotatingClient] Image request - Model: ${params.model}, BaseURL: ${this.baseConfig.baseURL}`);
    }

    return await this.executeWithRetry(async (client) => {
      const result = await client.chat.completions.create(params, options);
      // Debug: Log response for image generation requests
      if (hasImageContent || isImageGeneration) {
        const completion = result as OpenAI.Chat.Completions.ChatCompletion;
        const contentLength = completion.choices?.[0]?.message?.content?.length || 0;
        console.log(`[OpenAIRotatingClient] Image response - Content length: ${contentLength}`);
      }
      return result as OpenAI.Chat.Completions.ChatCompletion;
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
