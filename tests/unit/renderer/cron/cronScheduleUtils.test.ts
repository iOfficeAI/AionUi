/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCronSchedule, scheduleToDraft } from '../../../../src/renderer/pages/cron/cronScheduleUtils';

describe('cronScheduleUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips every schedules with a startAt anchor', () => {
    const firstRunAtMs = Date.UTC(2026, 2, 25, 10, 0, 0);
    const schedule = buildCronSchedule(
      {
        firstRunAtMs,
        intervalValue: 2,
        intervalUnit: 'hour',
      },
      'Hour x2 / 2026-03-25 10:00'
    );

    expect(schedule).toEqual({
      kind: 'every',
      everyMs: 2 * 60 * 60 * 1000,
      startAtMs: firstRunAtMs,
      description: 'Hour x2 / 2026-03-25 10:00',
    });
    expect(scheduleToDraft(schedule)).toEqual({
      firstRunAtMs,
      intervalValue: 2,
      intervalUnit: 'hour',
    });
  });

  it('builds monthly cron expressions from the selected first run time', () => {
    const firstRunAtMs = new Date(2026, 2, 25, 8, 15, 0).getTime();
    const schedule = buildCronSchedule(
      {
        firstRunAtMs,
        intervalValue: 2,
        intervalUnit: 'month',
      },
      'Month x2 / 2026-03-25 08:15'
    );

    expect(schedule).toEqual({
      kind: 'cron',
      expr: '15 8 25 1,3,5,7,9,11 *',
      startAtMs: firstRunAtMs,
      description: 'Month x2 / 2026-03-25 08:15',
    });
    expect(scheduleToDraft(schedule)).toEqual({
      firstRunAtMs,
      intervalValue: 2,
      intervalUnit: 'month',
    });
  });

  it('interprets a single explicit cron month as a yearly interval', () => {
    const firstRunAtMs = Date.UTC(2026, 3, 18, 9, 30, 0);

    expect(
      scheduleToDraft({
        kind: 'cron',
        expr: '30 9 18 4 *',
        startAtMs: firstRunAtMs,
        description: 'Year x1 / 2026-04-18 09:30',
      })
    ).toEqual({
      firstRunAtMs,
      intervalValue: 1,
      intervalUnit: 'year',
    });
  });

  it('falls back to the default hourly draft for unsupported cron expressions', () => {
    const fallback = scheduleToDraft({
      kind: 'cron',
      expr: '*/5 * * * 1-5',
      description: 'unsupported',
    });

    expect(fallback.intervalValue).toBe(1);
    expect(fallback.intervalUnit).toBe('hour');
    expect(fallback.firstRunAtMs).toBe(Date.now() + 60 * 60 * 1000);
  });

  it('builds interval schedules for custom workday rules', () => {
    const firstRunAtMs = Date.UTC(2026, 2, 27, 9, 0, 0);
    const schedule = buildCronSchedule(
      {
        firstRunAtMs,
        intervalValue: 2,
        intervalUnit: 'workday',
      },
      'Workday x2 / 2026-03-27 09:00'
    );

    expect(schedule).toEqual({
      kind: 'interval',
      intervalValue: 2,
      intervalUnit: 'workday',
      startAtMs: firstRunAtMs,
      description: 'Workday x2 / 2026-03-27 09:00',
    });
    expect(scheduleToDraft(schedule)).toEqual({
      firstRunAtMs,
      intervalValue: 2,
      intervalUnit: 'workday',
    });
  });
});
