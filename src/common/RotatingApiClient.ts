import { ApiKeyManager } from './ApiKeyManager';
import type { AuthType } from '@office-ai/aioncli-core';

// Unified interface for chat completion across different providers
export interface UnifiedChatCompletionParams {
  model: string;
  messages: unknown; // Allow flexible message formats for compatibility
}

export interface UnifiedChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      images?: Array<{
        type: 'image_url';
        image_url: { url: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface RotatingApiClientOptions {
  maxRetries?: number;
  retryDelay?: number;
}

// Constants for better maintainability
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;
const _RETRYABLE_STATUS_CODES = new Set([401, 429, 503]); // Reserved for future use

export interface ApiError extends Error {
  status?: number;
  code?: number;
}

export abstract class RotatingApiClient<T> {
  protected apiKeyManager?: ApiKeyManager;
  protected client?: T;
  protected readonly createClientFn: (apiKey: string) => T;
  protected readonly options: Required<RotatingApiClientOptions>;
  protected readonly originalApiKeys: string;

  constructor(apiKeys: string, authType: AuthType, createClientFn: (apiKey: string) => T, options: RotatingApiClientOptions = {}) {
    this.originalApiKeys = apiKeys;
    this.createClientFn = createClientFn;
    this.options = {
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelay: options.retryDelay ?? DEFAULT_RETRY_DELAY,
    };

    if (apiKeys && (apiKeys.includes(',') || apiKeys.includes('\n'))) {
      this.apiKeyManager = new ApiKeyManager(apiKeys, authType);
    }

    this.initializeClient();
  }

  protected initializeClient(): void {
    const apiKey = this.getCurrentApiKey();

    if (apiKey) {
      try {
        this.client = this.createClientFn(apiKey);
      } catch (error) {
        console.error('[RotatingApiClient] Client initialization failed:', error);
        throw error;
      }
    }
  }

  protected getCurrentApiKey(): string | undefined {
    if (this.apiKeyManager?.hasMultipleKeys()) {
      return this.apiKeyManager.getCurrentKey();
    }
    // For single key case, extract the first key
    return this.extractFirstKey();
  }

  private extractFirstKey(): string | undefined {
    if (!this.originalApiKeys) return undefined;

    if (this.isSingleKey()) {
      return this.originalApiKeys.trim() || undefined;
    }

    const keys = this.parseMultipleKeys();
    return keys[0] || undefined;
  }

  private isSingleKey(): boolean {
    return !this.originalApiKeys.includes(',') && !this.originalApiKeys.includes('\n');
  }

  private parseMultipleKeys(): string[] {
    return this.originalApiKeys
      .split(/[,\n]/)
      .map((key) => key.trim())
      .filter((key) => key);
  }

  protected isRetryableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const apiError = error as ApiError;
    const status = apiError.status || apiError.code;

    // Retry on 401 (unauthorized), 429 (rate limit), 503 (service unavailable), and 5xx errors
    return status === 401 || status === 429 || status === 503 || (status >= 500 && status < 600);
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async executeWithRetry<R>(operation: (client: T) => Promise<R>): Promise<R> {
    if (!this.client) {
      throw new Error('Client not initialized - no valid API key provided');
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        return await operation(this.client);
      } catch (error) {
        lastError = error;

        const isLastAttempt = attempt === this.options.maxRetries - 1;
        const canRotateKey = this.apiKeyManager?.hasMultipleKeys() && this.isRetryableError(error) && !isLastAttempt;

        if (canRotateKey && this.apiKeyManager.rotateKey()) {
          this.initializeClient();
          await this.delay(this.options.retryDelay * (attempt + 1));
          continue;
        }

        if (!this.isRetryableError(error) || isLastAttempt) {
          break;
        }

        // Regular retry with delay
        await this.delay(this.options.retryDelay * (attempt + 1));
      }
    }

    throw lastError;
  }

  hasMultipleKeys(): boolean {
    return this.apiKeyManager?.hasMultipleKeys() ?? false;
  }

  getKeyStatus() {
    return this.apiKeyManager?.getStatus() ?? null;
  }
}
