/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { normalizeLanguageCode, DEFAULT_LANGUAGE } from '@/common/config/i18n';

describe('i18n', () => {
  describe('normalizeLanguageCode', () => {
    it('passes through exact supported tags', () => {
      expect(normalizeLanguageCode('en-US')).toBe('en-US');
      expect(normalizeLanguageCode('zh-CN')).toBe('zh-CN');
      expect(normalizeLanguageCode('de-DE')).toBe('de-DE');
      expect(normalizeLanguageCode('fa-IR')).toBe('fa-IR');
    });

    it('normalizes underscores to hyphens', () => {
      expect(normalizeLanguageCode('de_DE')).toBe('de-DE');
      expect(normalizeLanguageCode('fa_IR')).toBe('fa-IR');
      expect(normalizeLanguageCode('pt_BR')).toBe('pt-BR');
    });

    it('resolves base language codes to their supported region', () => {
      expect(normalizeLanguageCode('zh')).toBe('zh-CN');
      expect(normalizeLanguageCode('ja')).toBe('ja-JP');
      expect(normalizeLanguageCode('ko')).toBe('ko-KR');
      expect(normalizeLanguageCode('tr')).toBe('tr-TR');
      expect(normalizeLanguageCode('ru')).toBe('ru-RU');
      expect(normalizeLanguageCode('uk')).toBe('uk-UA');
      expect(normalizeLanguageCode('pt')).toBe('pt-BR');
      expect(normalizeLanguageCode('de')).toBe('de-DE');
      expect(normalizeLanguageCode('es')).toBe('es-ES');
      expect(normalizeLanguageCode('fa')).toBe('fa-IR');
    });

    it('resolves German regional variants to de-DE', () => {
      expect(normalizeLanguageCode('de-AT')).toBe('de-DE');
      expect(normalizeLanguageCode('de-CH')).toBe('de-DE');
    });

    it('falls back to the default language for unsupported codes', () => {
      expect(normalizeLanguageCode('fr')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeLanguageCode('it')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeLanguageCode('')).toBe(DEFAULT_LANGUAGE);
    });
  });
});
