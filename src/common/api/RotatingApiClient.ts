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
  headers?: Headers | Record<string, string | string[] | number | undefined>;
  response?: {
    headers?: Headers | Record<string, string | string[] | number | undefined>;
  };
}

const RETRY_AFTER_MAX_DELAY_MS = 5 * 60 * 1000;

export abstract class RotatingApiClient<T> {
  protected apiKeyManager?: ApiKeyManager;
  protected client?: T;
  protected readonly createClientFn: (apiKey: string) => T;
  protected readonly options: Required<RotatingApiClientOptions>;
  protected readonly originalApiKeys: string;

  constructor(
    apiKeys: string,
    authType: AuthType,
    createClientFn: (apiKey: string) => T,
    options: RotatingApiClientOptions = {}
  ) {
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

  protected isRateLimitError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const apiError = error as ApiError;
    const status = apiError.status || apiError.code;
    return status === 429;
  }

  protected getRetryAfterDelay(error: unknown): number | undefined {
    if (!this.isRateLimitError(error) || !error || typeof error !== 'object') return undefined;

    const apiError = error as ApiError;
    const retryAfter =
      this.readHeader(apiError.headers, 'retry-after') ?? this.readHeader(apiError.response?.headers, 'retry-after');

    if (!retryAfter) return undefined;

    const delayMs = this.parseRetryAfterHeader(retryAfter);
    if (delayMs === undefined) return undefined;

    return Math.min(delayMs, RETRY_AFTER_MAX_DELAY_MS);
  }

  private readHeader(
    headers: Headers | Record<string, string | string[] | number | undefined> | undefined,
    name: string
  ): string | undefined {
    if (!headers) return undefined;

    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return headers.get(name) ?? undefined;
    }

    if ('get' in headers && typeof headers.get === 'function') {
      const value = headers.get(name);
      return typeof value === 'string' ? value : undefined;
    }

    const headerRecord = headers as Record<string, string | string[] | number | undefined>;
    const headerName = Object.keys(headerRecord).find((key) => key.toLowerCase() === name);
    if (!headerName) return undefined;

    const value = headerRecord[headerName];
    if (Array.isArray(value)) return value[0];
    if (typeof value === 'number') return value.toString();
    return value;
  }

  private parseRetryAfterHeader(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1000);
    }

    const retryDate = Date.parse(trimmed);
    if (Number.isNaN(retryDate)) return undefined;

    return Math.max(0, retryDate - Date.now());
  }

  protected getRetryDelay(error: unknown, attempt: number): number {
    return this.getRetryAfterDelay(error) ?? this.options.retryDelay * 2 ** attempt;
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
        const retryAfterDelay = this.getRetryAfterDelay(error);
        const shouldHonorRateLimitCooldown = retryAfterDelay !== undefined;
        const canRotateKey =
          this.apiKeyManager?.hasMultipleKeys() &&
          this.isRetryableError(error) &&
          !shouldHonorRateLimitCooldown &&
          !isLastAttempt;

        if (canRotateKey && this.apiKeyManager.rotateKey()) {
          this.initializeClient();
          await this.delay(this.getRetryDelay(error, attempt));
          continue;
        }

        if (!this.isRetryableError(error) || isLastAttempt) {
          break;
        }

        // Regular retry with delay
        await this.delay(this.getRetryDelay(error, attempt));
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
