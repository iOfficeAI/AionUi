import OpenAI from 'openai';
import { AuthType } from '@office-ai/aioncli-core';
import type { RotatingApiClientOptions } from './RotatingApiClient';
import { RotatingApiClient } from './RotatingApiClient';
import {
  evaluateCommandEveEgressBoundary,
  redactCommandEveSensitiveText,
  type CommandEveEgressPolicyAction,
} from './egressBoundaryCore';

export interface OpenAIClientConfig {
  baseURL?: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
  httpAgent?: unknown;
  commandEveEgressPolicyAction?: CommandEveEgressPolicyAction;
  commandEveEgressProviderName?: string;
}

export class OpenAIRotatingClient extends RotatingApiClient<OpenAI> {
  private readonly baseConfig: OpenAIClientConfig;

  constructor(api_keys: string, config: OpenAIClientConfig = {}, options: RotatingApiClientOptions = {}) {
    const createClient = (api_key: string) => {
      const cleanedApiKey = api_key.replace(/[\s\r\n\t]/g, '').trim();
      const openaiConfig: any = {
        baseURL: config.baseURL,
        api_key: cleanedApiKey,
        defaultHeaders: config.defaultHeaders,
      };

      if (config.httpAgent) {
        openaiConfig.httpAgent = config.httpAgent;
      }

      return new OpenAI(openaiConfig);
    };

    super(api_keys, AuthType.USE_OPENAI, createClient, options);
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

  private messageText(message: OpenAI.Chat.Completions.ChatCompletionMessageParam): string {
    const content = message.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        if ('text' in part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private redactMessage(
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    const nextMessage = { ...message } as Record<string, unknown>;
    const content = nextMessage.content;
    if (typeof content === 'string') {
      nextMessage.content = redactCommandEveSensitiveText(content);
      return nextMessage as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam;
    }
    if (!Array.isArray(content)) return nextMessage as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam;
    nextMessage.content = content.map((part) => {
      if (!part || typeof part !== 'object') return part;
      const nextPart = { ...part } as Record<string, unknown>;
      if (typeof nextPart.text === 'string') {
        nextPart.text = redactCommandEveSensitiveText(nextPart.text);
      }
      return nextPart;
    });
    return nextMessage as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam;
  }

  private async enforceCommandEveChatEgressBoundary(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ): Promise<OpenAI.Chat.Completions.ChatCompletionCreateParams> {
    const policyAction = this.baseConfig.commandEveEgressPolicyAction;
    if (!policyAction) return params;
    const boundary = await evaluateCommandEveEgressBoundary({
      text: params.messages.map((message) => this.messageText(message)).join('\n\n'),
      provider: {
        kind: 'cloud',
        name: this.baseConfig.commandEveEgressProviderName || 'openai-compatible',
        model: String(params.model || ''),
        baseUrl: this.baseConfig.baseURL,
      },
      policyAction,
    });
    if (boundary.decision === 'block') {
      throw new Error(
        `Command EVE blocked sensitive data before cloud model egress (${boundary.receipt.finding_count} finding(s)).`
      );
    }
    if (boundary.decision !== 'redact') return params;
    return {
      ...params,
      messages: params.messages.map((message) => this.redactMessage(message)),
    };
  }

  // Mirror of enforceCommandEveChatEgressBoundary for the image-generation path.
  // createImage egress (client.images.generate) would otherwise bypass the
  // Command EVE egress boundary entirely. The image prompt is a single string,
  // so we evaluate/block/redact that prompt rather than chat messages. Defense
  // in depth: block -> throw before egress; redact -> sanitize the prompt.
  private async enforceCommandEveImageEgressBoundary(
    params: OpenAI.Images.ImageGenerateParams
  ): Promise<OpenAI.Images.ImageGenerateParams> {
    const policyAction = this.baseConfig.commandEveEgressPolicyAction;
    if (!policyAction) return params;
    const boundary = await evaluateCommandEveEgressBoundary({
      text: typeof params.prompt === 'string' ? params.prompt : '',
      provider: {
        kind: 'cloud',
        name: this.baseConfig.commandEveEgressProviderName || 'openai-compatible',
        model: String(params.model || ''),
        baseUrl: this.baseConfig.baseURL,
      },
      policyAction,
    });
    if (boundary.decision === 'block') {
      throw new Error(
        `Command EVE blocked sensitive data before cloud model egress (${boundary.receipt.finding_count} finding(s)).`
      );
    }
    if (boundary.decision !== 'redact') return params;
    return {
      ...params,
      prompt: redactCommandEveSensitiveText(typeof params.prompt === 'string' ? params.prompt : ''),
    };
  }

  // Convenience methods for common OpenAI operations
  async createChatCompletion(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParams,
    options?: OpenAI.RequestOptions
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const safeParams = await this.enforceCommandEveChatEgressBoundary(params);
    return await this.executeWithRetry(async (client) => {
      const result = await client.chat.completions.create(safeParams, options);
      return result as OpenAI.Chat.Completions.ChatCompletion;
    });
  }

  async createImage(
    params: OpenAI.Images.ImageGenerateParams,
    options?: OpenAI.RequestOptions
  ): Promise<OpenAI.Images.ImagesResponse> {
    const safeParams = await this.enforceCommandEveImageEgressBoundary(params);
    return await this.executeWithRetry((client) => {
      return client.images.generate(safeParams, options) as Promise<OpenAI.Images.ImagesResponse>;
    });
  }

  async createEmbedding(
    params: OpenAI.Embeddings.EmbeddingCreateParams,
    options?: OpenAI.RequestOptions
  ): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
    return await this.executeWithRetry((client) => {
      return client.embeddings.create(params, options);
    });
  }
}
