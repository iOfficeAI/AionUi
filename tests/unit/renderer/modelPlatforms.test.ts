/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Locks the MODEL_PLATFORMS presentation order: the array order is what the
 * add-platform picker renders, so partner placement is part of the contract.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_PLATFORM_VALUE, MODEL_PLATFORMS } from '@renderer/utils/model/modelPlatforms';

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

  it('defines SSYCloud as an OpenAI-compatible preset with an API key registration link', () => {
    const ssyCloudEntries = MODEL_PLATFORMS.filter((p) => p.value === 'SSYCloud');

    expect(ssyCloudEntries).toHaveLength(1);
    expect(ssyCloudEntries[0]).toMatchObject({
      name: 'SSYCloud (胜算云)',
      logo: '/api/assets/logos/ai-cloud/ssycloud.svg',
      platform: 'custom',
      base_url: 'https://router.shengsuanyun.com/api/v1',
      apiKeyUrl: 'https://www.shengsuanyun.com/?from=CH_VVVBZY1S',
    });
  });

  it('does not show the SSYCloud API key link for unrelated providers', () => {
    const openAI = MODEL_PLATFORMS.find((p) => p.value === 'OpenAI');

    expect(openAI?.apiKeyUrl).toBeUndefined();
  });
});
