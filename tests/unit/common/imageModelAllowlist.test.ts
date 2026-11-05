/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isImageGenSupported } from '@/common/utils/imageModelAllowlist';

describe('isImageGenSupported', () => {
  it('accepts native Gemini image models', () => {
    const provider = { platform: 'gemini', name: 'Gemini' };
    expect(isImageGenSupported(provider, 'gemini-2.5-flash-image-preview')).toBe(true);
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

  // Since the media catalog landed (2026-08), support is no longer a three-rule
  // allowlist: any model whose catalog entry resolves to an API form we can
  // actually drive is supported. These cases moved from rejected to accepted.
  it('accepts OpenAI images API models on OpenAI-compatible providers', () => {
    const provider = { platform: 'custom', base_url: 'https://api.openai.com/v1', name: 'OpenAI' };
    expect(isImageGenSupported(provider, 'gpt-image-1')).toBe(true);
    expect(isImageGenSupported(provider, 'dall-e-3')).toBe(true);
  });

  it('accepts gateway-hosted diffusion models', () => {
    const provider = { platform: 'new-api', base_url: 'https://api.siliconflow.cn/v1', name: 'SiliconFlow' };
    expect(isImageGenSupported(provider, 'stabilityai/stable-diffusion-3-5-large')).toBe(true);
    expect(isImageGenSupported(provider, 'black-forest-labs/FLUX.1-schnell')).toBe(true);
  });

  // The original intent of this suite — never offer a model that will fail at
  // call time — still holds for hosts that speak their own native protocol.
  it('rejects diffusion models served over a vendor-native protocol', () => {
    const provider = { platform: 'custom', base_url: 'https://api.stability.ai', name: 'Stability AI' };
    expect(isImageGenSupported(provider, 'sd3.5-large')).toBe(false);
  });

  it('rejects images-API models on providers that do not speak the OpenAI protocol', () => {
    const provider = { platform: 'anthropic', base_url: 'https://api.anthropic.com', name: 'Anthropic' };
    expect(isImageGenSupported(provider, 'dall-e-3')).toBe(false);
  });

  it('rejects models whose API form has no adapter yet (async task APIs)', () => {
    const provider = {
      platform: 'custom',
      base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      name: 'DashScope',
    };
    expect(isImageGenSupported(provider, 'wanx2.1-t2i-turbo')).toBe(false);
  });
});
