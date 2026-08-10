/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in image model catalog.
 *
 * Ordering matters: entries are evaluated top-down and the first match wins.
 * Put provider-pinned entries (platform / base_url / provider-name matches)
 * before generic model-name-only entries.
 *
 * Form C entries are listed with their real protocol data but only become
 * selectable/executable once the async job engine lands (phase 2) — the
 * resolver gates on EXECUTABLE_FORMS.
 */

import type { MediaModelSpec } from './types';

export const BUILTIN_IMAGE_MODELS: MediaModelSpec[] = [
  // ===== Provider-pinned Form B entries (preserve the legacy allowlist rules) =====
  {
    id: 'gemini-image-preview',
    kind: 'image',
    form: 'B',
    match: {
      platform: ['gemini', 'gemini-vertex-ai'],
      model: /(image|banana|imagine)/i,
    },
    params: { imageInput: true },
  },
  {
    id: 'openrouter-image',
    kind: 'image',
    form: 'B',
    match: {
      baseUrlIncludes: ['openrouter.ai'],
      model: /(image|banana|imagine)/i,
    },
    params: { imageInput: true },
  },
  {
    id: 'antigravity-image',
    kind: 'image',
    form: 'B',
    match: {
      providerNameIncludes: ['antigravity'],
      model: /(image|banana|imagine)/i,
    },
    params: { imageInput: true },
  },

  // ===== Form A — OpenAI images API and compatible gateways =====
  {
    id: 'openai-gpt-image-1',
    kind: 'image',
    form: 'A',
    match: { model: /^gpt-image-1/i },
    params: {
      sizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
      qualities: ['low', 'medium', 'high', 'auto'],
      maxN: 4,
      imageInput: true,
    },
    defaults: { size: 'auto', quality: 'auto' },
  },
  {
    id: 'openai-dall-e-3',
    kind: 'image',
    form: 'A',
    match: { model: /^dall-e-3/i },
    params: {
      sizes: ['1024x1024', '1792x1024', '1024x1792'],
      qualities: ['standard', 'hd'],
      maxN: 1,
    },
    defaults: { size: '1024x1024', quality: 'standard' },
  },
  {
    id: 'openai-dall-e-2',
    kind: 'image',
    form: 'A',
    match: { model: /^dall-e-2/i },
    params: {
      sizes: ['256x256', '512x512', '1024x1024'],
      maxN: 10,
      imageInput: true,
    },
    defaults: { size: '1024x1024' },
  },
  {
    // Seedream on Volcano Ark exposes a synchronous OpenAI-style images API.
    id: 'ark-seedream',
    kind: 'image',
    form: 'A',
    match: { model: /seedream/i },
    params: {
      sizes: ['1024x1024', '1152x864', '864x1152', '1280x720', '720x1280', '832x1248', '1248x832', '1512x648'],
      seed: true,
      maxN: 1,
    },
    defaults: { size: '1024x1024' },
  },
  {
    // FLUX family — SiliconFlow, Together, fal, and OpenAI-compatible gateways.
    id: 'flux',
    kind: 'image',
    form: 'A',
    match: { model: /flux/i },
    params: {
      sizes: ['1024x1024', '960x1280', '768x1024', '720x1440', '720x1280', '1280x720', '1440x720'],
      seed: true,
      maxN: 4,
    },
    defaults: { size: '1024x1024' },
  },
  {
    // Stable Diffusion family on OpenAI-compatible gateways.
    id: 'stable-diffusion',
    kind: 'image',
    form: 'A',
    match: { model: /(stable-diffusion|sd-?3|sd-?3\.5|sdxl)/i },
    params: {
      sizes: ['1024x1024', '512x1024', '768x512', '768x1024', '1024x576', '576x1024'],
      seed: true,
      negativePrompt: true,
      maxN: 4,
    },
    defaults: { size: '1024x1024' },
  },
  {
    // Zhipu CogView (bigmodel.cn, OpenAI-compatible images endpoint).
    id: 'cogview',
    kind: 'image',
    form: 'A',
    match: { model: /cogview/i },
    params: {
      sizes: ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'],
      maxN: 1,
    },
    defaults: { size: '1024x1024' },
  },

  // ===== Form C — async task APIs (data ready; executable from phase 2) =====
  {
    // Tongyi WanX text-to-image on DashScope's native async task API.
    id: 'dashscope-wanx-image',
    kind: 'image',
    form: 'C',
    endpointStyle: 'dashscope-task',
    // Matches wanx-v1 / wanx2.1-t2i-turbo / wan2.2-t2i-flash naming generations.
    match: { model: /^wan(x|2)/i },
    params: {
      sizes: ['1024x1024', '720x1280', '1280x720', '768x1152'],
      seed: true,
      negativePrompt: true,
      maxN: 4,
    },
    defaults: { size: '1024x1024' },
    polling: { intervalMs: 3000, timeoutMs: 300_000 },
  },
  {
    // Jimeng (即梦) image generation on Volcano Ark's async task API.
    id: 'ark-jimeng-image',
    kind: 'image',
    form: 'C',
    endpointStyle: 'ark-task',
    match: { model: /jimeng/i },
    params: {
      sizes: ['1024x1024', '1280x720', '720x1280'],
      seed: true,
      maxN: 4,
    },
    defaults: { size: '1024x1024' },
    polling: { intervalMs: 3000, timeoutMs: 300_000 },
  },
];
