/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODEL_PLATFORM_VALUE,
  getPlatformByValue,
  getPlatformDefaultApiKey,
  getPlatformDefaultModel,
  getPresetProviders,
} from '@/renderer/utils/model/modelPlatforms';

vi.mock('@/renderer/utils/platform', () => ({
  resolveBackendAssetUrl: (url: string) => url,
}));

describe('modelPlatforms', () => {
  it('uses the local SGLang OpenAI-compatible endpoint as the productized default provider', () => {
    expect(DEFAULT_MODEL_PLATFORM_VALUE).toBe('SGLang');

    const platform = getPlatformByValue(DEFAULT_MODEL_PLATFORM_VALUE);

    expect(platform).toMatchObject({
      name: 'SGLang',
      value: 'SGLang',
      platform: 'custom',
      base_url: 'http://10.2.9.105:30000/v1',
      default_model: '/models/google/gemma-4-31B-it-FP8-block',
    });
    expect(getPlatformDefaultApiKey(DEFAULT_MODEL_PLATFORM_VALUE)).toBe('local-sglang');
    expect(getPlatformDefaultModel(DEFAULT_MODEL_PLATFORM_VALUE)).toBe('/models/google/gemma-4-31B-it-FP8-block');
    expect(getPresetProviders()).toContain(platform);
  });

  it('does not inject defaults for ordinary provider presets', () => {
    expect(getPlatformDefaultApiKey('OpenAI')).toBe('');
    expect(getPlatformDefaultApiKey('custom')).toBe('');
    expect(getPlatformDefaultModel('OpenAI')).toBe('');
    expect(getPlatformDefaultModel('custom')).toBe('');
  });
});
