/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from '@/renderer/utils/chat/relativeTime';

const NOW = Date.UTC(2026, 7, 20, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('collapses sub-minute ages to "now" instead of a ticking count', () => {
    expect(formatRelativeTime(NOW - 20_000, 'en-US', NOW)).toBe('now');
  });

  it('picks the coarsest unit the age clears', () => {
    expect(formatRelativeTime(NOW - 3 * MINUTE, 'en-US', NOW)).toBe('3 minutes ago');
    expect(formatRelativeTime(NOW - 5 * HOUR, 'en-US', NOW)).toBe('5 hours ago');
    expect(formatRelativeTime(NOW - 40 * DAY, 'en-US', NOW)).toBe('last month');
  });

  it('uses the word form for the adjacent unit', () => {
    // `numeric: 'auto'` is the reason a picker row reads "yesterday" rather
    // than "1 day ago".
    expect(formatRelativeTime(NOW - DAY, 'en-US', NOW)).toBe('yesterday');
  });

  it('localizes', () => {
    expect(formatRelativeTime(NOW - 3 * MINUTE, 'zh-CN', NOW)).toBe('3分钟前');
  });

  it('falls back to the runtime locale for an unusable language tag', () => {
    // A stale persisted language must not throw inside a render.
    expect(() => formatRelativeTime(NOW - 3 * MINUTE, 'not a tag', NOW)).not.toThrow();
  });

  it('returns empty for a non-finite timestamp', () => {
    expect(formatRelativeTime(Number.NaN, 'en-US', NOW)).toBe('');
  });
});
