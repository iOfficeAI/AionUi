/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/platform', () => ({
  resolveBackendAssetUrl: (url?: string) => url,
}));

import { getPlatformByValue, getPresetProviders, searchPlatformsByName } from '@/renderer/utils/model/modelPlatforms';

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
