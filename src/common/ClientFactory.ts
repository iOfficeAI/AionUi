/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@office-ai/aioncli-core';
import type { TProviderWithModel } from './storage';
import { OpenAIRotatingClient, type OpenAIClientConfig } from './adapters/OpenAIRotatingClient';
import { GeminiRotatingClient, type GeminiClientConfig } from './adapters/GeminiRotatingClient';
import { AnthropicRotatingClient, type AnthropicClientConfig } from './adapters/AnthropicRotatingClient';
import type { RotatingApiClientOptions } from './RotatingApiClient';
import { getProviderAuthType } from './utils/platformAuthType';
import { isNewApiPlatform } from './utils/platformConstants';

export interface ClientOptions {
  timeout?: number;
  proxy?: string;
  baseConfig?: OpenAIClientConfig | GeminiClientConfig | AnthropicClientConfig;
  rotatingOptions?: RotatingApiClientOptions;
}

export type RotatingClient = OpenAIRotatingClient | GeminiRotatingClient | AnthropicRotatingClient;

/**
 * 为 new-api 网关规范化 base URL
 * Normalize base URL for new-api gateway based on target protocol
 *
 * new-api 用户通常输入带 /v1 的 URL（OpenAI 格式），但 Gemini/Anthropic SDK
 * 需要根 URL（它们会自动附加各自的路径）。
 * new-api users typically enter URL with /v1 (OpenAI format), but Gemini/Anthropic SDKs
 * need the root URL (they append their own paths).
 *
 * @param baseUrl 原始 base URL / Original base URL
 * @param authType 目标认证类型 / Target auth type
 * @returns 规范化后的 base URL / Normalized base URL
 */
export function normalizeNewApiBaseUrl(baseUrl: string, authType: AuthType): string {
  if (!baseUrl) return baseUrl;

  // 移除尾部斜杠 / Remove trailing slashes
  const url = baseUrl.replace(/\/+$/, '');

  switch (authType) {
    case AuthType.USE_OPENAI: {
      // OpenAI SDK 需要带 /v1 的路径 / OpenAI SDK expects URL with /v1 path
      if (!url.endsWith('/v1')) {
        return `${url}/v1`;
      }
      return url;
    }
    case AuthType.USE_GEMINI:
    case AuthType.USE_ANTHROPIC: {
      // Gemini/Anthropic SDK 需要根 URL，移除常见的 API 路径后缀
      // Gemini/Anthropic SDKs need root URL, strip common API path suffixes
      return url.replace(/\/v1$/, '').replace(/\/v1beta$/, '');
    }
    default:
      return url;
  }
}

export class ClientFactory {
  static async createRotatingClient(provider: TProviderWithModel, options: ClientOptions = {}): Promise<RotatingClient> {
    const authType = getProviderAuthType(provider);
    const rotatingOptions = options.rotatingOptions || { maxRetries: 3, retryDelay: 1000 };

    // 对 new-api 网关进行 URL 规范化 / Normalize URL for new-api gateway
    const isNewApi = isNewApiPlatform(provider.platform);
    const baseUrl = isNewApi ? normalizeNewApiBaseUrl(provider.baseUrl, authType) : provider.baseUrl;

    switch (authType) {
      case AuthType.USE_OPENAI: {
        const clientConfig: OpenAIClientConfig = {
          baseURL: baseUrl,
          timeout: options.timeout,
          defaultHeaders: {
            'HTTP-Referer': 'https://aionui.com',
            'X-Title': 'AionUi',
          },
          ...(options.baseConfig as OpenAIClientConfig),
        };

        // 添加代理配置（如果提供）
        if (options.proxy) {
          const { HttpsProxyAgent } = await import('https-proxy-agent');
          clientConfig.httpAgent = new HttpsProxyAgent(options.proxy);
        }

        return new OpenAIRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
      }

      case AuthType.USE_GEMINI: {
        const clientConfig: GeminiClientConfig = {
          model: provider.useModel,
          baseURL: baseUrl,
          ...(options.baseConfig as GeminiClientConfig),
        };

        return new GeminiRotatingClient(provider.apiKey, clientConfig, rotatingOptions, authType);
      }

      case AuthType.USE_VERTEX_AI: {
        const clientConfig: GeminiClientConfig = {
          model: provider.useModel,
          // Note: Don't set baseURL for Vertex AI - it uses Google's built-in endpoints
          ...(options.baseConfig as GeminiClientConfig),
        };

        return new GeminiRotatingClient(provider.apiKey, clientConfig, rotatingOptions, authType);
      }

      case AuthType.USE_ANTHROPIC: {
        const clientConfig: AnthropicClientConfig = {
          model: provider.useModel,
          baseURL: baseUrl,
          timeout: options.timeout,
          ...(options.baseConfig as AnthropicClientConfig),
        };

        return new AnthropicRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
      }

      default: {
        // 默认使用OpenAI兼容协议
        const clientConfig: OpenAIClientConfig = {
          baseURL: baseUrl,
          timeout: options.timeout,
          defaultHeaders: {
            'HTTP-Referer': 'https://aionui.com',
            'X-Title': 'AionUi',
          },
          ...(options.baseConfig as OpenAIClientConfig),
        };

        // 添加代理配置（如果提供）
        if (options.proxy) {
          const { HttpsProxyAgent } = await import('https-proxy-agent');
          clientConfig.httpAgent = new HttpsProxyAgent(options.proxy);
        }

        return new OpenAIRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
      }
    }
  }
}
