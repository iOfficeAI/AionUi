/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the localized provider-name annotation and the
 * locale-aware alphabetical sort used by the add-platform picker.
 */

import { describe, expect, it } from 'vitest';

import {
  getPlatformBaseName,
  getPlatformDisplayName,
  sortPlatformsByDisplayName,
  type PlatformConfig,
} from '@renderer/utils/model/modelPlatforms';

/** A `t` stub that resolves the Dashscope annotation but returns the key for any other (untranslated) key. */
const tWithAnnotation = (key: string) => (key === 'settings.platformAnnotationDashscope' ? '阿里云百炼' : key);

/** Build a minimal PlatformConfig. */
function platform(name: string, overrides: Partial<PlatformConfig> = {}): PlatformConfig {
  return { name, value: name, logo: null, platform: 'custom', ...overrides };
}

describe('getPlatformBaseName', () => {
  it('returns the raw name when there is no i18nKey', () => {
    expect(getPlatformBaseName(platform('OpenAI'), tWithAnnotation)).toBe('OpenAI');
  });

  it('prefers the translated name when i18nKey is present', () => {
    const custom = platform('Custom', { i18nKey: 'settings.platformCustom' });
    expect(getPlatformBaseName(custom, (k) => (k === 'settings.platformCustom' ? '自定义' : k))).toBe('自定义');
  });
});

describe('getPlatformDisplayName', () => {
  const dashscope = platform('Dashscope', { annotationKey: 'settings.platformAnnotationDashscope' });

  it('appends a localized annotation in parentheses when the locale has a translation', () => {
    expect(getPlatformDisplayName(dashscope, tWithAnnotation)).toBe('Dashscope（阿里云百炼）');
  });

  it('falls back to the plain name when the locale has no translation for the annotation', () => {
    // A t that returns the key itself (react-i18next behaviour for a missing key).
    const identityT = (key: string) => key;
    expect(getPlatformDisplayName(dashscope, identityT)).toBe('Dashscope');
  });

  it('does not append an annotation when the platform has no annotationKey', () => {
    expect(getPlatformDisplayName(platform('OpenAI'), tWithAnnotation)).toBe('OpenAI');
  });

  it('renders base（annotation）starting from the translated base name when i18nKey is present', () => {
    const withBoth = platform('Dashscope', {
      i18nKey: 'settings.platformDashscope',
      annotationKey: 'settings.platformAnnotationDashscope',
    });
    const t = (key: string) =>
      key === 'settings.platformDashscope'
        ? 'Dashscope'
        : key === 'settings.platformAnnotationDashscope'
          ? '阿里云百炼'
          : key;
    expect(getPlatformDisplayName(withBoth, t)).toBe('Dashscope（阿里云百炼）');
  });
});

describe('sortPlatformsByDisplayName', () => {
  const platforms = [
    platform('OpenAI'),
    platform('Anthropic'),
    platform('Custom', { i18nKey: 'settings.platformCustom' }),
  ];

  it('sorts a copy alphabetically by base display name and does not mutate the input', () => {
    const original = [...platforms];
    const t = (key: string) => (key === 'settings.platformCustom' ? 'Custom' : key);
    const sorted = sortPlatformsByDisplayName(platforms, t, 'en-US');

    expect(sorted.map((p) => p.name)).toEqual(['Anthropic', 'Custom', 'OpenAI']);
    // Input not mutated
    expect(platforms.map((p) => p.name)).toEqual(original.map((p) => p.name));
  });

  it('is locale-aware: sorts Chinese-labeled platforms per the active locale', () => {
    const mixed = [
      platform('Anthropic'),
      platform('Dashscope', { annotationKey: 'settings.platformAnnotationDashscope' }),
      platform('Moonshot'),
    ];
    // zh-CN collator: latin letters first in alphabetical order, Chinese last.
    const t = (key: string) => (key === 'settings.platformAnnotationDashscope' ? 'Alt' : key);
    const sorted = sortPlatformsByDisplayName(mixed, t, 'zh-CN');
    // Base names (without annotation): Anthropic, Dashscope, Moonshot
    expect(sorted.map((p) => p.name)).toEqual(['Anthropic', 'Dashscope', 'Moonshot']);
  });
});
