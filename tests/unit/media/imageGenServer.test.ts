/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_GEN_ENV_KEYS } from '@/common/config/imageGenerationMcpEnv';

const executeMediaGenerationMock = vi.hoisted(() => vi.fn());

vi.mock('@/common/media', () => ({
  executeMediaGeneration: executeMediaGenerationMock,
}));

import {
  getProviderFromEnv,
  handleImageGeneration,
  normalizeImageUris,
} from '@process/resources/builtinMcp/imageGenServer';

const ENV_KEYS = Object.values(IMAGE_GEN_ENV_KEYS);

describe('imageGenServer', () => {
  const originalEnv: Record<string, string | undefined> = {};
  const originalCwd = process.cwd;

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    });
    delete process.env.AIONUI_IMG_PROXY;
    executeMediaGenerationMock.mockReset();
    process.cwd = vi.fn().mockReturnValue('/workspace/conversation-1');
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
    process.cwd = originalCwd;
  });

  describe('getProviderFromEnv', () => {
    it('returns null when platform or model is missing', () => {
      expect(getProviderFromEnv()).toBeNull();

      process.env[IMAGE_GEN_ENV_KEYS.platform] = 'gemini';
      expect(getProviderFromEnv()).toBeNull();
    });

    it('builds a provider from env, preferring the real provider name', () => {
      process.env[IMAGE_GEN_ENV_KEYS.platform] = 'gemini';
      process.env[IMAGE_GEN_ENV_KEYS.model] = 'gemini-image';
      process.env[IMAGE_GEN_ENV_KEYS.baseUrl] = 'https://generativelanguage.googleapis.com';
      process.env[IMAGE_GEN_ENV_KEYS.apiKey] = 'secret';
      process.env[IMAGE_GEN_ENV_KEYS.providerName] = 'My Gemini';

      const provider = getProviderFromEnv();

      expect(provider).toMatchObject({
        name: 'My Gemini',
        platform: 'gemini',
        base_url: 'https://generativelanguage.googleapis.com',
        api_key: 'secret',
        use_model: 'gemini-image',
      });
    });

    it('falls back to the builtin server name when providerName is absent', () => {
      process.env[IMAGE_GEN_ENV_KEYS.platform] = 'gemini';
      process.env[IMAGE_GEN_ENV_KEYS.model] = 'gemini-image';

      expect(getProviderFromEnv()?.name).toBe('aionui-image-generation');
    });
  });

  describe('normalizeImageUris', () => {
    it('returns an empty array for undefined', () => {
      expect(normalizeImageUris(undefined)).toEqual([]);
    });

    it('passes an array through unchanged', () => {
      expect(normalizeImageUris(['a.png', 'b.png'])).toEqual(['a.png', 'b.png']);
    });

    it('parses a JSON-stringified array', () => {
      expect(normalizeImageUris('["a.png","b.png"]' as unknown as string[])).toEqual(['a.png', 'b.png']);
    });

    it('wraps a single non-JSON string in an array', () => {
      expect(normalizeImageUris('a.png' as unknown as string[])).toEqual(['a.png']);
    });
  });

  describe('handleImageGeneration', () => {
    it('errors without calling executeMediaGeneration when no model is configured', async () => {
      const result = await handleImageGeneration({ prompt: 'a cat' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not configured');
      expect(executeMediaGenerationMock).not.toHaveBeenCalled();
    });

    it('dispatches to executeMediaGeneration with the trusted cwd as workspaceDir, never a model-supplied path', async () => {
      process.env[IMAGE_GEN_ENV_KEYS.platform] = 'openai';
      process.env[IMAGE_GEN_ENV_KEYS.model] = 'dall-e-3';
      process.env.AIONUI_IMG_PROXY = 'http://proxy.local:8080';
      executeMediaGenerationMock.mockResolvedValue({
        success: true,
        assets: [],
        text: 'Generated image saved to: /workspace/conversation-1/img-1.png',
      });

      const result = await handleImageGeneration({
        prompt: 'a cat',
        image_uris: ['ref.png'],
        size: '1024x1024',
        aspect_ratio: '1:1',
        n: 2,
        quality: 'hd',
        seed: 42,
        negative_prompt: 'blurry',
      });

      expect(executeMediaGenerationMock).toHaveBeenCalledWith({
        kind: 'image',
        prompt: 'a cat',
        params: {
          size: '1024x1024',
          aspectRatio: '1:1',
          n: 2,
          quality: 'hd',
          seed: 42,
          negativePrompt: 'blurry',
        },
        inputUris: ['ref.png'],
        provider: expect.objectContaining({ platform: 'openai', use_model: 'dall-e-3' }),
        workspaceDir: '/workspace/conversation-1',
        proxy: 'http://proxy.local:8080',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Generated image saved to');
    });

    it('surfaces a failed generation as an error result', async () => {
      process.env[IMAGE_GEN_ENV_KEYS.platform] = 'openai';
      process.env[IMAGE_GEN_ENV_KEYS.model] = 'dall-e-3';
      executeMediaGenerationMock.mockResolvedValue({
        success: false,
        assets: [],
        text: 'Error: rate limited',
        error: 'rate-limited',
      });

      const result = await handleImageGeneration({ prompt: 'a cat' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error: rate limited');
    });
  });
});
