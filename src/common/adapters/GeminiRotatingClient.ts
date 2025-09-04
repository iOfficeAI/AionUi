import { GoogleGenAI } from '@google/genai';
import { AuthType } from '@office-ai/aioncli-core';
import type { RotatingApiClientOptions } from '../RotatingApiClient';
import { RotatingApiClient } from '../RotatingApiClient';

export interface GeminiClientConfig {
  model?: string;
  baseURL?: string;
  requestOptions?: any;
}

export class GeminiRotatingClient extends RotatingApiClient<GoogleGenAI> {
  private readonly config: GeminiClientConfig;

  constructor(apiKeys: string, config: GeminiClientConfig = {}, options: RotatingApiClientOptions = {}) {
    const createClient = (apiKey: string) => {
      const cleanedApiKey = apiKey.replace(/[\s\r\n\t]/g, '').trim();
      const clientConfig: any = {
        apiKey: cleanedApiKey === '' ? undefined : cleanedApiKey,
        vertexai: false,
      };
      if (config.baseURL) {
        clientConfig.baseURL = config.baseURL;
      }
      return new GoogleGenAI(clientConfig);
    };

    super(apiKeys, AuthType.USE_GEMINI, createClient, options);
    this.config = config;
  }

  protected getCurrentApiKey(): string | undefined {
    if (this.apiKeyManager?.hasMultipleKeys()) {
      // For Gemini, try to get from environment first
      return process.env.GEMINI_API_KEY || this.apiKeyManager.getCurrentKey();
    }
    // Use base class method for single key
    return super.getCurrentApiKey();
  }

  // Remove async override since base class is now sync
  // protected async initializeClient(): Promise<void> {
  //   await super.initializeClient();
  // }

  // Basic method for Gemini operations - can be extended as needed
  async generateContent(prompt: string, config?: any): Promise<any> {
    return this.executeWithRetry(async (client) => {
      // client is GoogleGenAI, we need client.models to get the content generator
      const model = client.models.generateContent({
        model: this.config.model || 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...config,
      });
      return model;
    });
  }
}
