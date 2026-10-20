/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Locks the MODEL_PLATFORMS presentation order: the array order is what the
 * add-platform picker renders, so partner placement is part of the contract.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_PLATFORM_VALUE, getPresetProviders, MODEL_PLATFORMS } from '@renderer/utils/model/modelPlatforms';

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

describe('aimlapi.com preset provider', () => {
  const entry = MODEL_PLATFORMS.find((p) => p.value === 'AIMLAPI');

  it('shows the brand exactly as users know it', () => {
    // The brand is the domain, lowercase. It is not translated, so it carries
    // no i18nKey and the raw `name` is what the picker renders.
    expect(entry?.name).toBe('aimlapi.com');
    expect(entry?.i18nKey).toBeUndefined();
  });

  it('points at the OpenAI-compatible endpoint', () => {
    // /v1/completions does not exist on this API, so the OpenAI-compatible
    // chat surface at /v1 is the only correct base URL.
    expect(entry?.base_url).toBe('https://api.aimlapi.com/v1');
    expect(entry?.platform).toBe('custom');
  });

  it('is offered as a preset provider with a logo', () => {
    expect(getPresetProviders()).toContain(entry);
    expect(entry?.logo).toBeTruthy();
  });
});
