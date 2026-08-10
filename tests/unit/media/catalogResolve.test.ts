/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { clipParamsToSpec, EXECUTABLE_FORMS, isMediaGenSupported, resolveMediaModelSpec } from '@/common/media/catalog';
import { isImageGenSupported } from '@/common/utils/imageModelAllowlist';

describe('media catalog resolution', () => {
  describe('legacy allowlist behavior is preserved (Form B entries)', () => {
    it('supports gemini platform image models', () => {
      const provider = { platform: 'gemini', base_url: '', name: 'Google' };
      expect(isImageGenSupported(provider, 'gemini-2.5-flash-image-preview')).toBe(true);
      expect(resolveMediaModelSpec('image', provider, 'gemini-2.5-flash-image-preview')?.form).toBe('B');
    });

    it('supports gemini-vertex-ai platform image models', () => {
      const provider = { platform: 'gemini-vertex-ai', base_url: '', name: 'Vertex' };
      expect(isImageGenSupported(provider, 'imagine-3')).toBe(true);
    });

    it('supports openrouter-hosted image chat models', () => {
      const provider = { platform: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
      expect(isImageGenSupported(provider, 'google/gemini-2.5-flash-image-preview')).toBe(true);
      expect(isImageGenSupported(provider, 'nano-banana')).toBe(true);
    });

    it('supports antigravity providers by name', () => {
      const provider = { platform: 'openai', base_url: 'https://example.com/v1', name: 'AntigravityTools' };
      expect(isImageGenSupported(provider, 'gemini-3-pro-image-1x1')).toBe(true);
      expect(resolveMediaModelSpec('image', provider, 'gemini-3-pro-image-1x1')?.id).toBe('antigravity-image');
    });

    it('still rejects gemini text models', () => {
      const provider = { platform: 'gemini', base_url: '', name: 'Google' };
      expect(isImageGenSupported(provider, 'gemini-2.5-pro')).toBe(false);
    });
  });

  describe('resolveMediaModelSpec edge cases', () => {
    it('returns null for an empty model name rather than matching the first entry', () => {
      const provider = { platform: 'gemini', base_url: '', name: 'Google' };
      expect(resolveMediaModelSpec('image', provider, '')).toBeNull();
    });
  });

  describe('Form A entries (new coverage)', () => {
    it('supports dall-e-3 on OpenAI-compatible providers', () => {
      const provider = { platform: 'openai', base_url: 'https://api.openai.com/v1', name: 'OpenAI' };
      const spec = resolveMediaModelSpec('image', provider, 'dall-e-3');
      expect(spec?.form).toBe('A');
      expect(isImageGenSupported(provider, 'dall-e-3')).toBe(true);
    });

    it('supports gpt-image-1 and declares image input', () => {
      const provider = { platform: 'openai', base_url: 'https://api.openai.com/v1', name: 'OpenAI' };
      const spec = resolveMediaModelSpec('image', provider, 'gpt-image-1');
      expect(spec?.form).toBe('A');
      expect(spec?.params.imageInput).toBe(true);
    });

    it('supports FLUX and SD models on gateways', () => {
      const provider = { platform: 'new-api', base_url: 'https://api.siliconflow.cn/v1', name: 'SiliconFlow' };
      expect(isImageGenSupported(provider, 'black-forest-labs/FLUX.1-schnell')).toBe(true);
      expect(isImageGenSupported(provider, 'stabilityai/stable-diffusion-3-5-large')).toBe(true);
    });

    it('does not fire generic Form A entries on non-OpenAI-compatible platforms', () => {
      const provider = { platform: 'anthropic', base_url: 'https://api.anthropic.com', name: 'Anthropic' };
      expect(isImageGenSupported(provider, 'dall-e-3')).toBe(false);
      expect(resolveMediaModelSpec('image', provider, 'dall-e-3')).toBeNull();
    });
  });

  describe('Form C gating (async engine not shipped yet)', () => {
    it('resolves WanX to a Form C spec but reports unsupported', () => {
      const provider = {
        platform: 'openai',
        base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        name: 'DashScope',
      };
      const spec = resolveMediaModelSpec('image', provider, 'wanx2.1-t2i-turbo');
      expect(spec?.form).toBe('C');
      expect(EXECUTABLE_FORMS).not.toContain('C');
      expect(isImageGenSupported(provider, 'wanx2.1-t2i-turbo')).toBe(false);
    });

    it('video catalog resolves seedance but stays gated', () => {
      const provider = { platform: 'openai', base_url: 'https://ark.cn-beijing.volces.com/api/v3', name: 'Ark' };
      const spec = resolveMediaModelSpec('video', provider, 'doubao-seedance-1-0-pro');
      expect(spec?.form).toBe('C');
      expect(isMediaGenSupported('video', provider, 'doubao-seedance-1-0-pro')).toBe(false);
    });
  });

  describe('clipParamsToSpec', () => {
    const openaiProvider = { platform: 'openai', base_url: 'https://api.openai.com/v1', name: 'OpenAI' };

    it('keeps supported params and merges defaults underneath', () => {
      const spec = resolveMediaModelSpec('image', openaiProvider, 'dall-e-3');
      const { params, dropped } = clipParamsToSpec({ size: '1792x1024' }, spec);
      expect(params.size).toBe('1792x1024');
      expect(params.quality).toBe('standard'); // default merged
      expect(dropped).toEqual([]);
    });

    it('drops unsupported params and reports them', () => {
      const spec = resolveMediaModelSpec('image', openaiProvider, 'dall-e-3');
      const { params, dropped } = clipParamsToSpec({ seed: 42, negativePrompt: 'blur', n: 4 }, spec);
      expect(params.seed).toBeUndefined();
      expect(params.negativePrompt).toBeUndefined();
      expect(dropped).toContain('seed');
      expect(dropped).toContain('negativePrompt');
      // dall-e-3 maxN=1 → n>1 dropped
      expect(dropped).toContain('n');
    });

    it('drops values outside the declared vocabulary', () => {
      const spec = resolveMediaModelSpec('image', openaiProvider, 'dall-e-3');
      const { params, dropped } = clipParamsToSpec({ size: '999x999' }, spec);
      expect(dropped).toContain('size');
      // default still applies after the invalid value is dropped
      expect(params.size).toBe('1024x1024');
    });

    it('clamps n to maxN when multi-output is supported', () => {
      const spec = resolveMediaModelSpec('image', openaiProvider, 'gpt-image-1');
      const { params } = clipParamsToSpec({ n: 10 }, spec);
      expect(params.n).toBe(4);
    });

    it('drops everything except n=1 semantics with a null spec (fallback path)', () => {
      const { params, dropped } = clipParamsToSpec({ size: '1024x1024', seed: 1, n: 1 }, null);
      expect(params.size).toBeUndefined();
      expect(params.seed).toBeUndefined();
      expect(params.n).toBe(1);
      expect(dropped).toEqual(expect.arrayContaining(['size', 'seed']));
    });

    it('drops an out-of-vocabulary quality value but keeps a valid one', () => {
      const spec = resolveMediaModelSpec('image', openaiProvider, 'dall-e-3');
      expect(clipParamsToSpec({ quality: 'ultra' }, spec).dropped).toContain('quality');
      expect(clipParamsToSpec({ quality: 'hd' }, spec).params.quality).toBe('hd');
    });

    it('keeps a valid aspect ratio and drops an out-of-vocabulary one (video)', () => {
      const provider = { platform: 'openai', base_url: '', name: 'Kling' };
      const spec = resolveMediaModelSpec('video', provider, 'kling-v1.5');
      expect(spec).not.toBeNull();

      expect(clipParamsToSpec({ aspectRatio: '16:9' }, spec).params.aspectRatio).toBe('16:9');
      expect(clipParamsToSpec({ aspectRatio: '2.39:1' }, spec).dropped).toContain('aspectRatio');
    });

    it('keeps a valid duration/resolution/camera and drops out-of-vocabulary ones (video)', () => {
      const provider = { platform: 'openai', base_url: '', name: 'Kling' };
      const spec = resolveMediaModelSpec('video', provider, 'kling-v1.5');

      const kept = clipParamsToSpec({ durationSeconds: 10, resolution: '1080p', camera: 'zoom' }, spec);
      expect(kept.params).toMatchObject({ durationSeconds: 10, resolution: '1080p', camera: 'zoom' });
      expect(kept.dropped).toEqual([]);

      const invalid = clipParamsToSpec({ durationSeconds: 999, resolution: '8k', camera: 'orbit' }, spec);
      expect(invalid.dropped).toEqual(expect.arrayContaining(['durationSeconds', 'resolution', 'camera']));
    });

    it('merges duration/resolution defaults underneath when the caller omits them (video)', () => {
      const provider = { platform: 'openai', base_url: '', name: 'Kling' };
      const spec = resolveMediaModelSpec('video', provider, 'kling-v1.5');

      const { params } = clipParamsToSpec({}, spec);

      expect(params.durationSeconds).toBe(5);
      expect(params.resolution).toBe('720p');
    });

    it('merges an aspectRatio default only when neither size nor aspectRatio was already set', () => {
      // The catalog has no entry that declares an aspectRatio default, so this
      // exercises clipParamsToSpec directly against a fabricated spec — the
      // function is generic over any MediaModelSpec, not just seeded catalog data.
      const spec = {
        id: 'test-aspect-default',
        kind: 'video' as const,
        form: 'C' as const,
        match: { model: 'test-aspect-default' },
        params: { aspectRatios: ['16:9', '9:16'] },
        defaults: { aspectRatio: '16:9' },
      };

      expect(clipParamsToSpec({}, spec).params.aspectRatio).toBe('16:9');
      // A caller-provided aspectRatio wins over the default.
      expect(clipParamsToSpec({ aspectRatio: '9:16' }, spec).params.aspectRatio).toBe('9:16');
    });
  });
});
