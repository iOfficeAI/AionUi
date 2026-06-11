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

  it('rejects providers that look like image-capable but are not on the allowlist', () => {
    const provider = { platform: 'custom', base_url: 'https://api.openai.com/v1', name: 'OpenAI' };
    expect(isImageGenSupported(provider, 'gpt-image-1')).toBe(false);
    expect(isImageGenSupported(provider, 'dall-e-3')).toBe(false);
  });

  it('rejects unknown providers regardless of model name', () => {
    const provider = { platform: 'custom', base_url: 'https://api.stability.ai', name: 'Stability AI' };
    expect(isImageGenSupported(provider, 'sd3.5-large')).toBe(false);
  });
});
