/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { AnthropicRotatingClient } from '@/common/api/AnthropicRotatingClient';
import { GeminiRotatingClient } from '@/common/api/GeminiRotatingClient';
import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';

class TestOpenAIRotatingClient extends OpenAIRotatingClient {
  currentKeyForTest(): string | undefined {
    return this.getCurrentApiKey();
  }
}

class TestAnthropicRotatingClient extends AnthropicRotatingClient {
  currentKeyForTest(): string | undefined {
    return this.getCurrentApiKey();
  }
}

class TestGeminiRotatingClient extends GeminiRotatingClient {
  currentKeyForTest(): string | undefined {
    return this.getCurrentApiKey();
  }
}

describe('rotating provider environment isolation', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('uses ApiKeyManager for OpenAI multi-key rotation instead of process.env', () => {
    process.env.OPENAI_API_KEY = 'env-openai-key';
    const client = new TestOpenAIRotatingClient('openai-key-1,openai-key-2');

    expect(client.currentKeyForTest()).toBe('openai-key-1');
  });

  it('uses ApiKeyManager for Anthropic multi-key rotation instead of process.env', () => {
    process.env.ANTHROPIC_API_KEY = 'env-anthropic-key';
    const client = new TestAnthropicRotatingClient('anthropic-key-1,anthropic-key-2');

    expect(client.currentKeyForTest()).toBe('anthropic-key-1');
  });

  it('uses ApiKeyManager for Gemini multi-key rotation instead of process.env', () => {
    process.env.GEMINI_API_KEY = 'env-gemini-key';
    const client = new TestGeminiRotatingClient('gemini-key-1,gemini-key-2');

    expect(client.currentKeyForTest()).toBe('gemini-key-1');
  });
});
