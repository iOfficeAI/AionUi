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

/**
 * Image generation result interface
 * 图片生成结果接口
 */
export interface ImageGenerationResult {
  success: boolean;
  images?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: string;
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
  // 常用 OpenAI 操作的便捷方法
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

  /**
   * Generate image from text prompt (dedicated method for image generation tools)
   * 从文本提示生成图片（专用于图片生成工具的方法）
   *
   * @param prompt - Text description of the image to generate / 要生成图片的文本描述
   * @param model - Model to use for generation / 用于生成的模型
   * @param options - Additional request options / 额外的请求选项
   * @returns ImageGenerationResult with success status and image data / 包含成功状态和图片数据的结果
   */
  async generateImageFromPrompt(prompt: string, model: string, options?: OpenAI.RequestOptions): Promise<ImageGenerationResult> {
    try {
      const imageResponse = await this.createImage(
        {
          model,
          prompt,
          n: 1,
          size: '1024x1024',
        },
        options
      );

      return {
        success: true,
        images: imageResponse.data.map((d) => ({
          url: d.url,
          b64_json: d.b64_json,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createEmbedding(params: OpenAI.Embeddings.EmbeddingCreateParams, options?: OpenAI.RequestOptions): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
    return await this.executeWithRetry((client) => {
      return client.embeddings.create(params, options);
    });
  }
}
