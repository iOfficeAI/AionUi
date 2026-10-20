/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Locks the MODEL_PLATFORMS presentation order: the array order is what the
 * add-platform picker renders, so partner placement is part of the contract.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PLATFORM_VALUE,
  getPresetProviders,
  getProviderLogo,
  MODEL_PLATFORMS,
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

describe('Requesty preset provider', () => {
  const entry = MODEL_PLATFORMS.find((p) => p.value === 'Requesty');

  it('is an OpenAI-compatible preset next to OpenRouter', () => {
    expect(entry?.name).toBe('Requesty');
    expect(entry?.platform).toBe('custom');
    expect(entry?.base_url).toBe('https://router.requesty.ai/v1');
    expect(getPresetProviders()).toContain(entry);
    const values = MODEL_PLATFORMS.map((p) => p.value);
    expect(values.indexOf('Requesty')).toBe(values.indexOf('OpenRouter') + 1);
  });

  it('is not the default platform', () => {
    expect(DEFAULT_PLATFORM_VALUE).not.toBe('Requesty');
  });

  it('resolves its bundled logo by name and by base URL', () => {
    expect(entry?.logo).toBeTruthy();
    expect(getProviderLogo({ name: 'Requesty' })).toBe(entry?.logo);
    expect(getProviderLogo({ base_url: 'https://router.requesty.ai/v1' })).toBe(entry?.logo);
  });
});
