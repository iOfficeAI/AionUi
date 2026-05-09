/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { uuid, parseError, resolveLocaleKey } from '@/common/utils/utils';

describe('utils', () => {
  describe('uuid', () => {
    it('generates string of default length 8', () => {
      const id = uuid();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(8);
    });

    it('generates string of custom length', () => {
      expect(uuid(16).length).toBe(16);
      expect(uuid(32).length).toBe(32);
    });

    it('generates different ids on successive calls', () => {
      const id1 = uuid();
      const id2 = uuid();
      expect(id1).not.toBe(id2);
    });

    it('uses crypto.randomUUID when length >= 36', () => {
      const id = uuid(36);
      expect(id.length).toBe(36);
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('uses crypto.getRandomValues for lengths < 36', () => {
      const id = uuid(12);
      expect(id.length).toBe(12);
      expect(id).toMatch(/^[0-9a-f]{12}$/);
    });

    it('falls back to timestamp-based ID when crypto unavailable', () => {
      const originalCrypto = globalThis.crypto;
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const id = uuid(10);
      expect(id.length).toBe(10);

      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('parseError', () => {
    it('returns string as-is', () => {
      expect(parseError('error message')).toBe('error message');
    });

    it('extracts message from Error instance', () => {
      const error = new Error('test error');
      expect(parseError(error)).toBe('test error');
    });

    it('extracts msg property from object', () => {
      const error = { msg: 'custom error' };
      expect(parseError(error)).toBe('custom error');
    });

    it('extracts message property from object', () => {
      const error = { message: 'object error' };
      expect(parseError(error)).toBe('object error');
    });

    it('prefers msg over message', () => {
      const error = { msg: 'msg value', message: 'message value' };
      expect(parseError(error)).toBe('msg value');
    });

    it('stringifies object without msg/message', () => {
      const error = { code: 500, status: 'fail' };
      expect(parseError(error)).toBe('{"code":500,"status":"fail"}');
    });

    it('handles null', () => {
      expect(parseError(null)).toBe('null');
    });

    it('handles undefined', () => {
      // JSON.stringify(undefined) returns undefined, not a string
      expect(parseError(undefined)).toBeUndefined();
    });

    it('handles number', () => {
      expect(parseError(404)).toBe('404');
    });

    it('handles boolean', () => {
      expect(parseError(true)).toBe('true');
    });

    it('handles circular reference gracefully', () => {
      const error: any = { name: 'circular' };
      error.self = error;
      expect(typeof parseError(error)).toBe('string');
    });
  });

  describe('resolveLocaleKey', () => {
    it('resolves zh variants to zh-CN', () => {
      expect(resolveLocaleKey('zh')).toBe('zh-CN');
      expect(resolveLocaleKey('zh-CN')).toBe('zh-CN');
      expect(resolveLocaleKey('zh-Hans')).toBe('zh-CN');
    });

    it('resolves zh-TW to zh-TW', () => {
      expect(resolveLocaleKey('zh-TW')).toBe('zh-TW');
      expect(resolveLocaleKey('zh-tw')).toBe('zh-TW');
      expect(resolveLocaleKey('zh-Hant')).toBe('zh-CN'); // Falls back to CN
    });

    it('resolves ja variants to ja-JP', () => {
      expect(resolveLocaleKey('ja')).toBe('ja-JP');
      expect(resolveLocaleKey('ja-JP')).toBe('ja-JP');
    });

    it('resolves ko variants to ko-KR', () => {
      expect(resolveLocaleKey('ko')).toBe('ko-KR');
      expect(resolveLocaleKey('ko-KR')).toBe('ko-KR');
    });

    it('resolves tr variants to tr-TR', () => {
      expect(resolveLocaleKey('tr')).toBe('tr-TR');
      expect(resolveLocaleKey('tr-TR')).toBe('tr-TR');
    });

    it('resolves unknown languages to en-US', () => {
      expect(resolveLocaleKey('en')).toBe('en-US');
      expect(resolveLocaleKey('en-US')).toBe('en-US');
      expect(resolveLocaleKey('fr')).toBe('en-US');
      expect(resolveLocaleKey('de')).toBe('en-US');
      expect(resolveLocaleKey('es')).toBe('en-US');
    });

    it('is case-insensitive', () => {
      expect(resolveLocaleKey('ZH')).toBe('zh-CN');
      expect(resolveLocaleKey('JA')).toBe('ja-JP');
      expect(resolveLocaleKey('KO')).toBe('ko-KR');
      expect(resolveLocaleKey('TR')).toBe('tr-TR');
    });

    it('handles empty string', () => {
      expect(resolveLocaleKey('')).toBe('en-US');
    });
  });
});
