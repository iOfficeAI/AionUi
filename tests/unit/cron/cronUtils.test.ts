/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCronSchedule,
  formatCronRunConversationTitle,
  getCurrentCronTimeZone,
} from '@/renderer/pages/cron/cronUtils';

const originalDateTimeFormat = Intl.DateTimeFormat;

describe('cronUtils', () => {
  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
    vi.restoreAllMocks();
  });

  it('uses the current system timezone when building cron schedules', () => {
    Intl.DateTimeFormat = vi.fn(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' }),
        }) as Intl.DateTimeFormat
    ) as unknown as typeof Intl.DateTimeFormat;

    expect(createCronSchedule('0 10 * * *', 'Daily at 10:00')).toEqual({
      kind: 'cron',
      expr: '0 10 * * *',
      tz: 'Asia/Shanghai',
      description: 'Daily at 10:00',
    });
  });

  it('falls back to UTC when timezone resolution fails', () => {
    Intl.DateTimeFormat = vi.fn(() => {
      throw new Error('boom');
    }) as unknown as typeof Intl.DateTimeFormat;

    expect(getCurrentCronTimeZone()).toBe('UTC');
  });

  it('formats new cron run conversation titles with the execution date', () => {
    expect(formatCronRunConversationTitle('Daily report', Date.UTC(2026, 6, 1, 12, 0, 0))).toBe(
      'Daily report 01-07-26'
    );
  });
});
