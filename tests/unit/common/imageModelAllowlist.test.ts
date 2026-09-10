/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isImageGenSupported, resolveImageGenerationApiMode } from '@/common/utils/imageModelAllowlist';

describe('isImageGenSupported', () => {
  it('accepts native Gemini image models', () => {
    const provider = { platform: 'gemini', name: 'Gemini' };
    expect(isImageGenSupported(provider, 'gemini-3.1-flash-image')).toBe(true);
  });

  it('accepts Vertex AI Gemini image models', () => {
    const provider = { platform: 'gemini-vertex-ai', name: 'Vertex AI' };
    expect(isImageGenSupported(provider, 'gemini-2.5-flash-image')).toBe(true);
  });

  it('accepts OpenRouter image chat models via base_url', () => {
    const provider = { platform: 'custom', base_url: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
    expect(isImageGenSupported(provider, 'google/gemini-2.5-flash-image-preview')).toBe(true);
    expect(isImageGenSupported(provider, 'nano-banana')).toBe(true);
  });

  it('accepts AntigravityTools by name', () => {
    const provider = { platform: 'custom', name: 'AntigravityTools' };
    expect(isImageGenSupported(provider, 'gemini-3-pro-image-1x1')).toBe(true);
  });

  it('rejects models without an image-style suffix even on supported providers', () => {
    const provider = { platform: 'gemini', name: 'Gemini' };
    expect(isImageGenSupported(provider, 'gemini-2.5-pro')).toBe(false);
  });

  it('accepts GPT Image models on OpenAI-compatible providers via the Images API', () => {
    const provider = { platform: 'custom', base_url: 'https://api.openai.com/v1', name: 'OpenAI' };
    expect(isImageGenSupported(provider, 'gpt-image-2')).toBe(true);
    expect(isImageGenSupported(provider, 'gpt-image-2-2026-04-21')).toBe(true);
    expect(resolveImageGenerationApiMode(provider, 'gpt-image-2')).toBe('openai-images');
  });

  it.each([
    'dall-e-3',
    'grok-imagine-image-2.0',
    'doubao-seedream-5-0-pro',
    'black-forest-labs/flux.2-pro',
    'stable-diffusion-3.5-large',
    'recraftv4_1_pro',
    'qwen-image-3.0-pro',
    'tongyi/z-image-turbo',
    'ideogram-4.0',
    'MAI-Image-2.5-Pro',
    'HiDream-O1-Image-1.5',
    'cogview-4',
    'hunyuan-image-3.0',
    'kolors-2.0',
    'krea-2-large',
    'reve-2.1',
    'firefly-image-5',
    'midjourney-v7',
  ])('accepts popular model family %s through an OpenAI-compatible gateway', (modelName) => {
    const provider = { platform: 'custom', base_url: 'https://images.example.com/v1', name: 'Images Gateway' };
    expect(resolveImageGenerationApiMode(provider, modelName)).toBe('openai-images');
  });

  it('keeps OpenRouter image models on the chat-completions route', () => {
    const provider = { platform: 'custom', base_url: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
    expect(resolveImageGenerationApiMode(provider, 'gpt-image-2')).toBe('chat-completions');
    expect(resolveImageGenerationApiMode(provider, 'black-forest-labs/flux.2-pro')).toBe('chat-completions');
  });

  it.each([
    ['https://api.stability.ai', 'stable-image-ultra'],
    ['https://api.replicate.com/v1', 'black-forest-labs/flux-schnell'],
    ['https://fal.run', 'qwen-image-3.0-pro'],
    ['https://api.bfl.ai/v1', 'flux-2-pro'],
    ['https://api.ideogram.ai/v1', 'ideogram-4.0'],
    ['https://dashscope-intl.aliyuncs.com/api/v1', 'qwen-image-3.0-pro'],
    ['https://api.dev.runwayml.com/v1', 'gen4_image'],
    ['https://firefly-api.adobe.io/v4', 'firefly-image-5'],
  ])('does not claim OpenAI compatibility for native endpoint %s', (baseUrl, modelName) => {
    const provider = { platform: 'custom', base_url: baseUrl, name: 'Native Provider' };
    expect(isImageGenSupported(provider, modelName)).toBe(false);
  });

  it('still accepts compatible official endpoints for xAI, Recraft, and Volcengine Ark', () => {
    expect(
      isImageGenSupported(
        { platform: 'custom', base_url: 'https://api.x.ai/v1', name: 'xAI' },
        'grok-imagine-image-2.0'
      )
    ).toBe(true);
    expect(
      isImageGenSupported(
        { platform: 'custom', base_url: 'https://external.api.recraft.ai/v1', name: 'Recraft' },
        'recraftv4_1_pro'
      )
    ).toBe(true);
    expect(
      isImageGenSupported(
        { platform: 'custom', base_url: 'https://ark.cn-beijing.volces.com/api/v3', name: 'Ark' },
        'doubao-seedream-5-0-pro'
      )
    ).toBe(true);
  });

  it('recognizes a Microsoft MAI endpoint even when its model is a custom deployment name', () => {
    const provider = {
      platform: 'custom',
      base_url: 'https://example.services.ai.azure.com/mai/v1',
      name: 'Microsoft Foundry',
    };
    expect(resolveImageGenerationApiMode(provider, 'production-image-deployment')).toBe('openai-images');
  });

  it('rejects an unknown image-like model until the user opts into custom models', () => {
    const provider = { platform: 'custom', base_url: 'https://images.example.com/v1', name: 'Custom' };
    expect(isImageGenSupported(provider, 'my-image-model')).toBe(false);
  });
});
