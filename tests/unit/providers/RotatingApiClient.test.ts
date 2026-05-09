/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RotatingApiClient } from '@/common/api/RotatingApiClient';
import { AuthType } from '@office-ai/aioncli-core';

// Do not globally mock ApiKeyManager - we'll test integration with real ApiKeyManager
// Only mock it selectively in specific tests that need custom behavior

// Concrete test implementation of abstract RotatingApiClient
class TestRotatingApiClient extends RotatingApiClient<any> {
  constructor(api_keys: string, authType: AuthType, options = {}) {
    super(api_keys, authType, (key) => ({ apiKey: key }), options);
  }
}

describe('RotatingApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('creates client for single key', () => {
      const client = new TestRotatingApiClient('sk-single', AuthType.USE_OPENAI);
      expect(client.hasMultipleKeys()).toBe(false);
    });

    it('creates ApiKeyManager for comma-separated keys', () => {
      const client = new TestRotatingApiClient('key1,key2', AuthType.USE_OPENAI);
      expect(client.hasMultipleKeys()).toBe(true);
    });

    it('creates ApiKeyManager for newline-separated keys', () => {
      const client = new TestRotatingApiClient('key1\nkey2', AuthType.USE_ANTHROPIC);
      expect(client.hasMultipleKeys()).toBe(true);
    });

    it('does not create ApiKeyManager for single key', () => {
      const client = new TestRotatingApiClient('single-key', AuthType.USE_OPENAI);
      expect(client.hasMultipleKeys()).toBe(false);
    });

    it('calls createClientFn with first key', () => {
      const createClientSpy = vi.fn((key) => ({ apiKey: key }));
      class SpyClient extends RotatingApiClient<any> {
        constructor(api_keys: string) {
          super(api_keys, AuthType.USE_OPENAI, createClientSpy);
        }
      }
      const client = new SpyClient('test-key');
      expect(createClientSpy).toHaveBeenCalledWith('test-key');
    });
  });

  describe('error handling', () => {
    it('identifies 401 as retryable', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      const error = { status: 401 };
      expect((client as any).isRetryableError(error)).toBe(true);
    });

    it('identifies 429 as retryable', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      const error = { status: 429 };
      expect((client as any).isRetryableError(error)).toBe(true);
    });

    it('identifies 503 as retryable', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      const error = { status: 503 };
      expect((client as any).isRetryableError(error)).toBe(true);
    });

    it('identifies 5xx as retryable', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      expect((client as any).isRetryableError({ status: 500 })).toBe(true);
      expect((client as any).isRetryableError({ status: 502 })).toBe(true);
      expect((client as any).isRetryableError({ status: 599 })).toBe(true);
    });

    it('identifies 400 as non-retryable', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      const error = { status: 400 };
      expect((client as any).isRetryableError(error)).toBe(false);
    });

    it('identifies 404 as non-retryable', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      const error = { status: 404 };
      expect((client as any).isRetryableError(error)).toBe(false);
    });

    it('handles error with code instead of status', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      const error = { code: 429 };
      expect((client as any).isRetryableError(error)).toBe(true);
    });

    it('handles non-object error', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      expect((client as any).isRetryableError('string error')).toBe(false);
      expect((client as any).isRetryableError(null)).toBe(false);
    });
  });

  describe('executeWithRetry', () => {
    it('succeeds on first attempt', async () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      const operation = vi.fn().mockResolvedValue('success');

      const result = await client.executeWithRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('throws if no client initialized', async () => {
      const client = new TestRotatingApiClient('', AuthType.USE_OPENAI);
      const operation = vi.fn();

      await expect(client.executeWithRetry(operation)).rejects.toThrow(/Client not initialized/);
    });

    it('retries on retryable error', async () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI, { maxRetries: 3 });
      const operation = vi.fn().mockRejectedValueOnce({ status: 429 }).mockResolvedValue('success');

      const result = await client.executeWithRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('exhausts retries and throws last error', async () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI, { maxRetries: 2 });
      const operation = vi.fn().mockRejectedValue({ status: 503 });

      await expect(client.executeWithRetry(operation)).rejects.toEqual({ status: 503 });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('stops retrying on non-retryable error', async () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI, { maxRetries: 3 });
      const operation = vi.fn().mockRejectedValue({ status: 400 });

      await expect(client.executeWithRetry(operation)).rejects.toEqual({ status: 400 });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('rotates key on retryable error with multiple keys (integration test)', async () => {
      // Use real ApiKeyManager with multiple keys
      const client = new TestRotatingApiClient('key1,key2,key3', AuthType.USE_OPENAI, { maxRetries: 3 });
      let attemptCount = 0;
      const operation = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.reject({ status: 401 });
        }
        return Promise.resolve('success');
      });

      const result = await client.executeWithRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      // Key should have rotated
      const status = client.getKeyStatus();
      expect(status).toBeTruthy();
      expect(status.blacklisted.length).toBeGreaterThan(0);
    });

    it('does not rotate key on last attempt', async () => {
      // Use real ApiKeyManager with multiple keys
      const client = new TestRotatingApiClient('key1,key2', AuthType.USE_OPENAI, { maxRetries: 1 });
      const operation = vi.fn().mockRejectedValue({ status: 429 });

      await expect(client.executeWithRetry(operation)).rejects.toEqual({ status: 429 });
      expect(operation).toHaveBeenCalledTimes(1);
      // No rotation should happen on last attempt
      const status = client.getKeyStatus();
      expect(status).toBeTruthy();
      // Blacklist should still be empty because it's the last attempt
      expect(status.blacklisted.length).toBe(0);
    });
  });

  describe('options', () => {
    it('uses default maxRetries and retryDelay', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI);
      expect((client as any).options.maxRetries).toBe(3);
      expect((client as any).options.retryDelay).toBe(1000);
    });

    it('accepts custom maxRetries', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI, { maxRetries: 5 });
      expect((client as any).options.maxRetries).toBe(5);
    });

    it('accepts custom retryDelay', () => {
      const client = new TestRotatingApiClient('key', AuthType.USE_OPENAI, { retryDelay: 2000 });
      expect((client as any).options.retryDelay).toBe(2000);
    });
  });
});
