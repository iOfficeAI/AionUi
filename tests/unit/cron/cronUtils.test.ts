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
  getJobCommandText,
  isShellJob,
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

  it('formats new cron run conversation titles with the execution date in the app language', () => {
    const runAt = Date.UTC(2026, 6, 1, 12, 0, 0);
    // The previous hardcoded DD-MM-YY read as the wrong date in month-first
    // locales; the date part now follows the app language.
    expect(formatCronRunConversationTitle('Daily report', runAt, 'en-US')).toBe('Daily report 07/01/26');
    expect(formatCronRunConversationTitle('Daily report', runAt, 'de-DE')).toBe('Daily report 01.07.26');
    // No language falls back to the default (en-US), never the host locale.
    expect(formatCronRunConversationTitle('Daily report', runAt)).toBe('Daily report 07/01/26');
  });

  describe('shell job helpers', () => {
    const agentJob = {
      target: { payload: { kind: 'message', text: 'do the thing' } },
    } as never;

    const shellJob = {
      target: { payload: { kind: 'shell', command: 'git fetch --all --prune', workspace: '/tmp/forks' } },
    } as never;

    it('detects shell jobs', () => {
      expect(isShellJob(agentJob)).toBe(false);
      expect(isShellJob(shellJob)).toBe(true);
    });

    it('returns prompt text for agent jobs and commands for shell jobs', () => {
      expect(getJobCommandText(agentJob)).toBe('do the thing');
      expect(getJobCommandText(shellJob)).toBe('git fetch --all --prune');
    });
  });
});
