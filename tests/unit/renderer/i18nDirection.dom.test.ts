/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { applyDocumentDirection, directionForLanguage, isRtlLanguage } from '@/renderer/services/i18n/direction';

describe('isRtlLanguage / directionForLanguage', () => {
  it('marks fa-IR as RTL', () => {
    expect(isRtlLanguage('fa-IR')).toBe(true);
    expect(directionForLanguage('fa-IR')).toBe('rtl');
  });

  it('normalises regional and underscore variants before deciding', () => {
    expect(isRtlLanguage('fa')).toBe(true);
    expect(isRtlLanguage('fa_IR')).toBe(true);
  });

  it('treats every other shipped language as LTR', () => {
    for (const lang of ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'de-DE', 'ru-RU', 'tr-TR', 'uk-UA']) {
      expect(isRtlLanguage(lang)).toBe(false);
      expect(directionForLanguage(lang)).toBe('ltr');
    }
  });

  it('defaults to LTR for missing input', () => {
    expect(isRtlLanguage(undefined)).toBe(false);
    expect(isRtlLanguage(null)).toBe(false);
    expect(directionForLanguage(undefined)).toBe('ltr');
  });
});

describe('applyDocumentDirection', () => {
  it('sets dir and lang on <html> for an RTL language', () => {
    applyDocumentDirection('fa-IR');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('fa-IR');
  });

  it('switches back to LTR when the language changes away', () => {
    applyDocumentDirection('fa-IR');
    applyDocumentDirection('de-DE');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('de-DE');
  });
});
