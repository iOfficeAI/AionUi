/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientFactory, normalizeNewApiBaseUrl } from '@/common/api/ClientFactory';
import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';
import { AnthropicRotatingClient } from '@/common/api/AnthropicRotatingClient';
import { AuthType } from '@office-ai/aioncli-core';

// Mock rotating clients
vi.mock('@/common/api/OpenAIRotatingClient');
vi.mock('@/common/api/AnthropicRotatingClient');

// Mock utility functions
vi.mock('@/common/utils/platformAuthType', () => ({
  getProviderAuthType: vi.fn((provider) => provider.authType || AuthType.USE_OPENAI),
}));

vi.mock('@/common/utils/platformConstants', () => ({
  isNewApiPlatform: vi.fn((platform) => platform === 'new-api'),
}));

describe('ClientFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeNewApiBaseUrl', () => {
    it('adds /v1 suffix for OpenAI', () => {
      const result = normalizeNewApiBaseUrl('https://api.example.com', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.example.com/v1');
    });

    it('strips existing /v1 and re-adds for OpenAI', () => {
      const result = normalizeNewApiBaseUrl('https://api.example.com/v1', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.example.com/v1');
    });

    it('strips /v1beta and adds /v1 for OpenAI', () => {
      const result = normalizeNewApiBaseUrl('https://api.example.com/v1beta', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.example.com/v1');
    });

    it('returns root URL for Anthropic', () => {
      const result = normalizeNewApiBaseUrl('https://api.example.com/v1', AuthType.USE_ANTHROPIC);
      expect(result).toBe('https://api.example.com');
    });

    it('removes trailing slashes', () => {
      const result = normalizeNewApiBaseUrl('https://api.example.com///', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.example.com/v1');
    });

    it('handles empty base URL', () => {
      const result = normalizeNewApiBaseUrl('', AuthType.USE_OPENAI);
      expect(result).toBe('');
    });
  });

  describe('createRotatingClient', () => {
    const mockProvider = {
      id: 'test-provider',
      platform: 'openai',
      api_key: 'sk-test-key',
      base_url: 'https://api.openai.com',
      use_model: 'gpt-4',
      authType: AuthType.USE_OPENAI,
    };

    it('creates OpenAIRotatingClient for USE_OPENAI', async () => {
      const client = await ClientFactory.createRotatingClient(mockProvider);
      expect(OpenAIRotatingClient).toHaveBeenCalled();
      expect(client).toBeInstanceOf(OpenAIRotatingClient);
    });

    it('creates AnthropicRotatingClient for USE_ANTHROPIC', async () => {
      const anthropicProvider = {
        ...mockProvider,
        authType: AuthType.USE_ANTHROPIC,
      };
      const client = await ClientFactory.createRotatingClient(anthropicProvider);
      expect(AnthropicRotatingClient).toHaveBeenCalled();
      expect(client).toBeInstanceOf(AnthropicRotatingClient);
    });

    it('normalizes base URL for new-api platform', async () => {
      const newApiProvider = {
        ...mockProvider,
        platform: 'new-api',
        base_url: 'https://gateway.example.com/v1',
      };
      await ClientFactory.createRotatingClient(newApiProvider);
      const calls = (OpenAIRotatingClient as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      // Client should receive normalized URL
      const config = calls[0][1];
      expect(config.baseURL).toBe('https://gateway.example.com/v1');
    });

    it('does not normalize base URL for non-new-api platform', async () => {
      const standardProvider = {
        ...mockProvider,
        platform: 'openai',
        base_url: 'https://api.openai.com/v1beta',
      };
      await ClientFactory.createRotatingClient(standardProvider);
      const calls = (OpenAIRotatingClient as any).mock.calls;
      const config = calls[0][1];
      expect(config.baseURL).toBe('https://api.openai.com/v1beta');
    });

    it('passes timeout option to client', async () => {
      await ClientFactory.createRotatingClient(mockProvider, { timeout: 30000 });
      const calls = (OpenAIRotatingClient as any).mock.calls;
      const config = calls[0][1];
      expect(config.timeout).toBe(30000);
    });

    it('passes rotating options to client', async () => {
      await ClientFactory.createRotatingClient(mockProvider, {
        rotatingOptions: { maxRetries: 5, retryDelay: 2000 },
      });
      const calls = (OpenAIRotatingClient as any).mock.calls;
      const rotatingOpts = calls[0][2];
      expect(rotatingOpts.maxRetries).toBe(5);
      expect(rotatingOpts.retryDelay).toBe(2000);
    });

    it('adds default HTTP-Referer and X-Title headers for OpenAI', async () => {
      await ClientFactory.createRotatingClient(mockProvider);
      const calls = (OpenAIRotatingClient as any).mock.calls;
      const config = calls[0][1];
      expect(config.defaultHeaders).toEqual({
        'HTTP-Referer': 'https://aionui.com',
        'X-Title': 'AionUi',
      });
    });

    it('handles proxy option for OpenAI', async () => {
      await ClientFactory.createRotatingClient(mockProvider, { proxy: 'http://proxy.example.com:8080' });
      const calls = (OpenAIRotatingClient as any).mock.calls;
      const config = calls[0][1];
      expect(config.httpAgent).toBeDefined();
    });

    it('passes model to Anthropic config', async () => {
      const anthropicProvider = {
        ...mockProvider,
        authType: AuthType.USE_ANTHROPIC,
        use_model: 'claude-sonnet-4-20250514',
      };
      await ClientFactory.createRotatingClient(anthropicProvider);
      const calls = (AnthropicRotatingClient as any).mock.calls;
      const config = calls[0][1];
      expect(config.model).toBe('claude-sonnet-4-20250514');
    });

    it('defaults to OpenAI client for unknown auth type', async () => {
      const unknownProvider = {
        ...mockProvider,
        authType: 'UNKNOWN' as AuthType,
      };
      await ClientFactory.createRotatingClient(unknownProvider);
      expect(OpenAIRotatingClient).toHaveBeenCalled();
    });
  });
});
