/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@office-ai/aioncli-core';
import type { TProviderWithModel } from '../config/storage';
import { OpenAIRotatingClient, type OpenAIClientConfig } from './OpenAIRotatingClient';
import { GeminiRotatingClient, type GeminiClientConfig } from './GeminiRotatingClient';
import { AnthropicRotatingClient, type AnthropicClientConfig } from './AnthropicRotatingClient';
import type { RotatingApiClientOptions } from './RotatingApiClient';
import { getProviderAuthType } from '../utils/platformAuthType';
import { isNewApiPlatform } from '../utils/platformConstants';

export interface ClientOptions {
  timeout?: number;
  proxy?: string;
  baseConfig?: OpenAIClientConfig | GeminiClientConfig | AnthropicClientConfig;
  rotatingOptions?: RotatingApiClientOptions;
}

export type RotatingClient = OpenAIRotatingClient | GeminiRotatingClient | AnthropicRotatingClient;

/**
 * 已知的完整 API 路径模式（不需要再添加 /v1）
 * Known complete API path patterns (no need to add /v1)
 *
 * 这些路径已经是完整的 API 端点路径，OpenAI SDK 会自动添加 /chat/completions
 * These paths are already complete API endpoint paths, OpenAI SDK adds /chat/completions automatically
 *
 * 注意：/v1beta 仅用于 Gemini 协议，在 normalizeNewApiBaseUrl 中单独处理
 * Note: /v1beta is only for Gemini protocol, handled separately in normalizeNewApiBaseUrl
 */
const COMPLETE_API_PATHS = [
  '/v1', // 标准格式 / Standard: OpenAI, DeepSeek, Moonshot, Mistral, SiliconFlow
  '/v2', // 百度千帆 / Baidu Qianfan
  '/v3', // 腾讯云 Coding、通用 v3 / Tencent Coding, generic v3
  '/api/v1', // OpenRouter
  '/api/v3', // 火山引擎 Ark / Volcengine Ark
  '/api/paas/v4', // 智谱 / Zhipu
  '/openai/v1', // Groq
  '/compatible-mode/v1', // 阿里云 DashScope / Alibaba DashScope
  '/compatibility/v1', // Cohere
];

/**
 * 检查 URL 是否已包含完整的 API 路径
 * Check if URL already contains a complete API path
 *
 * @param url 要检查的 URL / URL to check
 * @returns 是否包含完整路径 / Whether it contains a complete path
 */
function hasCompleteApiPath(url: string): boolean {
  const normalizedUrl = url.replace(/\/+$/, '');
  return COMPLETE_API_PATHS.some((path) => normalizedUrl.endsWith(path));
}

/**
 * 为 new-api 网关规范化 base URL
 * Normalize base URL for new-api gateway based on target protocol
 *
 * 策略：
 * - OpenAI 协议：如果 URL 已包含完整的 API 路径（如 /v2, /v3, /api/v3 等），直接使用，不再添加 /v1
 * - Gemini 协议：剥离 /v1beta 后缀，返回根 URL（SDK 会自动添加路径）
 * - Anthropic 协议：剥离 /v1 后缀，返回根 URL（SDK 会自动添加路径）
 *
 * Strategy:
 * - OpenAI protocol: If URL already contains a complete API path (e.g., /v2, /v3, /api/v3), use directly without adding /v1
 * - Gemini protocol: Strip /v1beta suffix, return root URL (SDK appends its own paths)
 * - Anthropic protocol: Strip /v1 suffix, return root URL (SDK appends its own paths)
 *
 * @param baseUrl 原始 base URL / Original base URL
 * @param authType 目标认证类型 / Target auth type
 * @returns 规范化后的 base URL / Normalized base URL
 */
export function normalizeNewApiBaseUrl(baseUrl: string, authType: AuthType): string {
  if (!baseUrl) return baseUrl;

  const normalizedUrl = baseUrl.replace(/\/+$/, '');

  switch (authType) {
    case AuthType.USE_OPENAI: {
      // OpenAI SDK 需要带 /v1 的路径
      // OpenAI SDK expects URL with /v1 path
      // 如果 URL 已包含完整的 API 路径，直接使用，不再添加 /v1
      // If URL already contains a complete API path, use directly without adding /v1
      if (hasCompleteApiPath(normalizedUrl)) {
        return normalizedUrl;
      }
      return `${normalizedUrl}/v1`;
    }
    case AuthType.USE_GEMINI: {
      // Gemini SDK 需要根 URL（它会自动附加 /v1beta 等路径）
      // Gemini SDK needs root URL (it appends /v1beta and other paths automatically)
      // 剥离 /v1beta 后缀（如果存在）
      // Strip /v1beta suffix if present
      return normalizedUrl.replace(/\/v1beta$/, '');
    }
    case AuthType.USE_ANTHROPIC: {
      // Anthropic SDK 需要根 URL（它会自动附加 /v1/messages 等路径）
      // Anthropic SDK needs root URL (it appends /v1/messages and other paths automatically)
      // 剥离 /v1 后缀（如果存在）
      // Strip /v1 suffix if present
      return normalizedUrl.replace(/\/v1$/, '');
    }
    default:
      return normalizedUrl;
  }
}

export class ClientFactory {
  static async createRotatingClient(
    provider: TProviderWithModel,
    options: ClientOptions = {}
  ): Promise<RotatingClient> {
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
