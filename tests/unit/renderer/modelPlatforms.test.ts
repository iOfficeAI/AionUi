/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Locks the MODEL_PLATFORMS presentation order: the array order is what the
 * add-platform picker renders, so partner placement is part of the contract.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/platform', () => ({
  resolveBackendAssetUrl: (url?: string) => url,
}));

import {
  DEFAULT_PLATFORM_VALUE,
  MODEL_PLATFORMS,
  getPlatformByValue,
  getPresetProviders,
  searchPlatformsByName,
} from '@renderer/utils/model/modelPlatforms';

describe('MODEL_PLATFORMS ordering', () => {
  it('keeps Custom first and pins both Moonshot entries right after it', () => {
    const values = MODEL_PLATFORMS.map((p) => p.value);
    expect(values[0]).toBe('custom');
    expect(values[1]).toBe('Moonshot');
    expect(values[2]).toBe('Moonshot-Global');
  });

  it('defaults the add-model modal platform to the first list entry', () => {
    expect(DEFAULT_PLATFORM_VALUE).toBe(MODEL_PLATFORMS[0].value);
    expect(DEFAULT_PLATFORM_VALUE).toBe('custom');
  });

  it('defines each Moonshot entry exactly once', () => {
    const moonshotEntries = MODEL_PLATFORMS.filter((p) => p.value.startsWith('Moonshot'));
    expect(moonshotEntries.map((p) => p.value)).toEqual(['Moonshot', 'Moonshot-Global']);
    expect(moonshotEntries.map((p) => p.base_url)).toEqual([
      'https://api.moonshot.cn/v1',
      'https://api.moonshot.ai/v1',
    ]);
  });
});

describe('model platform presets', () => {
  it('registers Atlas Cloud as an OpenAI-compatible custom provider preset', () => {
    expect(getPlatformByValue('AtlasCloud')).toMatchObject({
      name: 'Atlas Cloud',
      value: 'AtlasCloud',
      logo: null,
      platform: 'custom',
      base_url: 'https://api.atlascloud.ai/v1',
    });
  });

  it('includes Atlas Cloud in provider preset search and base URL listings', () => {
    expect(getPresetProviders().some((provider) => provider.value === 'AtlasCloud')).toBe(true);
    expect(searchPlatformsByName('atlas')).toEqual([
      expect.objectContaining({
        name: 'Atlas Cloud',
        base_url: 'https://api.atlascloud.ai/v1',
      }),
    ]);
  });
});
