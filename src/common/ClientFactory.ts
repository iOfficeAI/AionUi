/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@office-ai/aioncli-core';
import type { TProviderWithModel } from './storage';
import { OpenAIRotatingClient, type OpenAIClientConfig } from './adapters/OpenAIRotatingClient';
import { GeminiRotatingClient, type GeminiClientConfig } from './adapters/GeminiRotatingClient';
import type { RotatingApiClientOptions } from './RotatingApiClient';
import { getProviderAuthType } from './utils/platformAuthType';

export interface ClientOptions {
  timeout?: number;
  proxy?: string;
  baseConfig?: OpenAIClientConfig | GeminiClientConfig;
  rotatingOptions?: RotatingApiClientOptions;
}

export type RotatingClient = OpenAIRotatingClient | GeminiRotatingClient;

export class ClientFactory {
  static createRotatingClient(
    provider: TProviderWithModel,
    options: ClientOptions = {}
  ): RotatingClient {
    const authType = getProviderAuthType(provider);
    const rotatingOptions = options.rotatingOptions || { maxRetries: 3, retryDelay: 1000 };

    switch (authType) {
      case AuthType.USE_OPENAI: {
        const clientConfig: OpenAIClientConfig = {
          baseURL: provider.baseUrl,
          timeout: options.timeout,
          defaultHeaders: {
            'HTTP-Referer': 'https://www.aionui.com',
            'X-Title': 'AionUi',
          },
          ...(options.baseConfig as OpenAIClientConfig),
        };

        // 添加代理配置（如果提供）
        if (options.proxy) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const HttpsProxyAgent = require('https-proxy-agent');
          clientConfig.httpAgent = new HttpsProxyAgent(options.proxy);
        }

        return new OpenAIRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
      }

      case AuthType.USE_GEMINI: {
        const clientConfig: GeminiClientConfig = {
          model: provider.useModel,
          baseURL: provider.baseUrl,
          ...(options.baseConfig as GeminiClientConfig),
        };

        return new GeminiRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
      }

      default:
        // 默认使用OpenAI兼容协议
        const clientConfig: OpenAIClientConfig = {
          baseURL: provider.baseUrl,
          timeout: options.timeout,
          defaultHeaders: {
            'HTTP-Referer': 'https://www.aionui.com',
            'X-Title': 'AionUi',
          },
          ...(options.baseConfig as OpenAIClientConfig),
        };

        // 添加代理配置（如果提供）
        if (options.proxy) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const HttpsProxyAgent = require('https-proxy-agent');
          clientConfig.httpAgent = new HttpsProxyAgent(options.proxy);
        }

        return new OpenAIRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
    }
  }
}