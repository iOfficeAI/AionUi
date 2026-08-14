/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseHttpUrl, resolveSelectionHttpUrl } from '@/renderer/utils/url';

describe('parseHttpUrl', () => {
  it('accepts a plain https URL', () => {
    expect(parseHttpUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('accepts a plain http URL', () => {
    expect(parseHttpUrl('http://example.com')).toBe('http://example.com/');
  });

  it('trims surrounding whitespace', () => {
    expect(parseHttpUrl('  https://example.com  ')).toBe('https://example.com/');
  });

  it('rejects text with internal whitespace', () => {
    expect(parseHttpUrl('https://example.com foo')).toBeNull();
    expect(parseHttpUrl('see https://example.com')).toBeNull();
  });

  it('rejects URLs without an http(s) protocol', () => {
    expect(parseHttpUrl('www.example.com')).toBeNull();
    expect(parseHttpUrl('example.com')).toBeNull();
    expect(parseHttpUrl('ftp://example.com')).toBeNull();
    expect(parseHttpUrl('file:///tmp/x')).toBeNull();
    expect(parseHttpUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects ordinary text and empty input', () => {
    expect(parseHttpUrl('hello world')).toBeNull();
    expect(parseHttpUrl('')).toBeNull();
    expect(parseHttpUrl('   ')).toBeNull();
  });
});

describe('resolveSelectionHttpUrl (text path)', () => {
  it('returns the URL when the selected text is a single http(s) URL', () => {
    expect(resolveSelectionHttpUrl('https://example.com', null, null)).toBe('https://example.com/');
  });

  it('returns null for ordinary text when there is no anchor', () => {
    expect(resolveSelectionHttpUrl('hello world', null, null)).toBeNull();
  });
});
