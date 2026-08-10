/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Locks the MODEL_PLATFORMS presentation order: the array order is what the
 * add-platform picker renders, so partner placement is part of the contract.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_PLATFORM_VALUE, MODEL_PLATFORMS, getPlatformByValue } from '@renderer/utils/model/modelPlatforms';

describe('MODEL_PLATFORMS ordering', () => {
  it('keeps CSBU API first and Ruiqing API second', () => {
    const values = MODEL_PLATFORMS.map((p) => p.value);
    expect(values[0]).toBe('csbu-api');
    expect(values[1]).toBe('ruiqing-api');
  });

  it('keeps Custom and both Moonshot entries together after the branded presets', () => {
    const values = MODEL_PLATFORMS.map((p) => p.value);
    expect(values.slice(2, 5)).toEqual(['custom', 'Moonshot', 'Moonshot-Global']);
  });

  it('defaults the add-model modal platform to the first list entry', () => {
    expect(DEFAULT_PLATFORM_VALUE).toBe(MODEL_PLATFORMS[0].value);
    expect(DEFAULT_PLATFORM_VALUE).toBe('csbu-api');
  });

  it('defines each Moonshot entry exactly once', () => {
    const moonshotEntries = MODEL_PLATFORMS.filter((p) => p.value.startsWith('Moonshot'));
    expect(moonshotEntries.map((p) => p.value)).toEqual(['Moonshot', 'Moonshot-Global']);
    expect(moonshotEntries.map((p) => p.base_url)).toEqual([
      'https://api.moonshot.cn/v1',
      'https://api.moonshot.ai/v1',
    ]);
  });

  it('configures CSBU API as a branded New API preset', () => {
    const platform = getPlatformByValue('csbu-api');
    expect(platform?.platform).toBe('new-api');
    expect(platform?.base_url).toBe('http://10.51.135.15:8180/');
    expect(platform?.logo).toBe(getPlatformByValue('new-api')?.logo);
  });

  it('configures Ruiqing API as a branded New API preset', () => {
    const platform = getPlatformByValue('ruiqing-api');
    expect(platform?.platform).toBe('new-api');
    expect(platform?.base_url).toBe('https://uniapi.ruijie.com.cn/v1');
    expect(platform?.logo).toBe(getPlatformByValue('new-api')?.logo);
  });
});
