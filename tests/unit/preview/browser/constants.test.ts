/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  BROWSER_BLANK_URL,
  BROWSER_TAB_FALLBACK_TITLE,
  browserTabLabelFromUrl,
  resolveAddressBarInput,
} from '@/renderer/pages/conversation/Preview/browser/constants';

describe('resolveAddressBarInput', () => {
  it('returns null for empty or whitespace-only input', () => {
    expect(resolveAddressBarInput('')).toBeNull();
    expect(resolveAddressBarInput('   ')).toBeNull();
  });

  it('passes through input that already carries a scheme', () => {
    expect(resolveAddressBarInput('https://example.com/a?b=c')).toBe('https://example.com/a?b=c');
    expect(resolveAddressBarInput('http://example.com')).toBe('http://example.com');
  });

  it('passes through host-less schemes untouched', () => {
    expect(resolveAddressBarInput('about:blank')).toBe('about:blank');
    expect(resolveAddressBarInput('data:text/html,<p>hi</p>')).toBe('data:text/html,<p>hi</p>');
    expect(resolveAddressBarInput('view-source:https://example.com')).toBe('view-source:https://example.com');
  });

  it('upgrades bare hostnames to https', () => {
    expect(resolveAddressBarInput('example.com')).toBe('https://example.com');
    expect(resolveAddressBarInput('sub.example.co.uk/path')).toBe('https://sub.example.co.uk/path');
  });

  it('upgrades localhost and IPv4 addresses, with or without a port', () => {
    expect(resolveAddressBarInput('localhost:3000')).toBe('https://localhost:3000');
    expect(resolveAddressBarInput('localhost')).toBe('https://localhost');
    expect(resolveAddressBarInput('127.0.0.1:8080/health')).toBe('https://127.0.0.1:8080/health');
  });

  it('treats input containing whitespace as a search query', () => {
    // 关键行为：带空格的输入不是主机名，必须走搜索而不是被拼成非法 URL
    // Key behavior: whitespace is never a hostname, so search instead of building
    // an invalid URL.
    expect(resolveAddressBarInput('how to configure nginx')).toBe(
      'https://www.bing.com/search?q=how%20to%20configure%20nginx'
    );
    expect(resolveAddressBarInput('example.com is down')).toBe('https://www.bing.com/search?q=example.com%20is%20down');
  });

  it('treats a single word with no TLD as a search query', () => {
    expect(resolveAddressBarInput('weather')).toBe('https://www.bing.com/search?q=weather');
  });

  it('percent-encodes characters that would break the search URL', () => {
    expect(resolveAddressBarInput('a&b=c')).toBe('https://www.bing.com/search?q=a%26b%3Dc');
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(resolveAddressBarInput('  example.com  ')).toBe('https://example.com');
  });
});

describe('browserTabLabelFromUrl', () => {
  it('falls back to the placeholder for blank or empty addresses', () => {
    expect(browserTabLabelFromUrl('')).toBe(BROWSER_TAB_FALLBACK_TITLE);
    expect(browserTabLabelFromUrl(BROWSER_BLANK_URL)).toBe(BROWSER_TAB_FALLBACK_TITLE);
  });

  it('uses the hostname as a compact label', () => {
    expect(browserTabLabelFromUrl('https://example.com/very/long/path?with=query')).toBe('example.com');
  });

  it('falls back to the placeholder for unparseable input', () => {
    expect(browserTabLabelFromUrl('not a url')).toBe(BROWSER_TAB_FALLBACK_TITLE);
  });
});
