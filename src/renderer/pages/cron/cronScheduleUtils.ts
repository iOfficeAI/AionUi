/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronSchedule } from '@/common/adapter/ipcBridge';

export type CronIntervalUnit = 'minute' | 'hour' | 'day' | 'month' | 'year';
export type CronEditableIntervalUnit = CronIntervalUnit | 'week' | 'workday';

export type CronScheduleDraft = {
  firstRunAtMs: number;
  intervalValue: number;
  intervalUnit: CronEditableIntervalUnit;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const DEFAULT_INTERVAL_DRAFT: Pick<CronScheduleDraft, 'intervalValue' | 'intervalUnit'> = {
  intervalValue: 1,
  intervalUnit: 'hour',
};

export function buildCronSchedule(
  draft: CronScheduleDraft,
  description: string
): Extract<ICronSchedule, { kind: 'every' | 'cron' | 'interval' }> {
  const normalizedValue = Math.max(1, Math.trunc(draft.intervalValue));

  if (draft.intervalUnit === 'week' || draft.intervalUnit === 'workday') {
    return {
      kind: 'interval',
      intervalValue: normalizedValue,
      intervalUnit: draft.intervalUnit,
      startAtMs: draft.firstRunAtMs,
      description,
    };
  }

  if (draft.intervalUnit === 'month') {
    return {
      kind: 'cron',
      expr: buildMonthlyCronExpr(draft.firstRunAtMs, normalizedValue),
      startAtMs: draft.firstRunAtMs,
      description,
    };
  }

  return {
    kind: 'every',
    everyMs: getUnitDurationMs(draft.intervalUnit) * normalizedValue,
    startAtMs: draft.firstRunAtMs,
    description,
  };
}

export function scheduleToDraft(schedule: ICronSchedule): CronScheduleDraft {
  if (schedule.kind === 'at') {
    return {
      firstRunAtMs: schedule.atMs,
      intervalValue: 1,
      intervalUnit: 'day',
    };
  }

  if (schedule.kind === 'every') {
    return {
      firstRunAtMs: schedule.startAtMs ?? Date.now() + schedule.everyMs,
      ...getEveryScheduleUnit(schedule.everyMs),
    };
  }

  if (schedule.kind === 'interval') {
    return {
      firstRunAtMs: schedule.startAtMs,
      intervalValue: schedule.intervalValue,
      intervalUnit: schedule.intervalUnit,
    };
  }

  return {
    firstRunAtMs: schedule.startAtMs ?? Date.now() + HOUR_MS,
    ...getCronScheduleUnit(schedule.expr),
  };
}

function getUnitDurationMs(unit: Exclude<CronEditableIntervalUnit, 'month' | 'workday'>): number {
  switch (unit) {
    case 'minute':
      return MINUTE_MS;
    case 'hour':
      return HOUR_MS;
    case 'day':
      return DAY_MS;
    case 'week':
      return WEEK_MS;
    case 'year':
      return YEAR_MS;
  }
}

function getEveryScheduleUnit(everyMs: number): Pick<CronScheduleDraft, 'intervalValue' | 'intervalUnit'> {
  if (everyMs % YEAR_MS === 0 && everyMs >= YEAR_MS) {
    return { intervalValue: everyMs / YEAR_MS, intervalUnit: 'year' };
  }

  if (everyMs % WEEK_MS === 0 && everyMs >= WEEK_MS) {
    return { intervalValue: everyMs / WEEK_MS, intervalUnit: 'week' };
  }

  if (everyMs % DAY_MS === 0 && everyMs >= DAY_MS) {
    return { intervalValue: everyMs / DAY_MS, intervalUnit: 'day' };
  }

  if (everyMs % HOUR_MS === 0 && everyMs >= HOUR_MS) {
    return { intervalValue: everyMs / HOUR_MS, intervalUnit: 'hour' };
  }

  return { intervalValue: Math.max(1, Math.round(everyMs / MINUTE_MS)), intervalUnit: 'minute' };
}

function getCronScheduleUnit(expr: string): Pick<CronScheduleDraft, 'intervalValue' | 'intervalUnit'> {
  const parts = expr.trim().split(/\s+/);
  const normalizedParts = parts.length >= 5 ? parts.slice(-5) : [];
  const weeklyTokenPattern = /^(MON|TUE|WED|THU|FRI|SAT|SUN)$/;

  if (normalizedParts.length !== 5) {
    return DEFAULT_INTERVAL_DRAFT;
  }

  const [_minute, _hour, dayOfMonth, month, dayOfWeek] = normalizedParts;
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === 'MON-FRI') {
    return { intervalValue: 1, intervalUnit: 'workday' };
  }

  if (dayOfMonth === '*' && month === '*' && weeklyTokenPattern.test(dayOfWeek)) {
    return { intervalValue: 1, intervalUnit: 'week' };
  }

  if (dayOfWeek !== '*' || dayOfMonth === '*') {
    return DEFAULT_INTERVAL_DRAFT;
  }

  if (month === '*') {
    return { intervalValue: 1, intervalUnit: 'month' };
  }

  const monthValues = parseMonthValues(month);
  if (monthValues.length === 0) {
    return DEFAULT_INTERVAL_DRAFT;
  }
  if (monthValues.length === 1) {
    return { intervalValue: 1, intervalUnit: 'year' };
  }

  const firstGap = ((monthValues[1] ?? monthValues[0]) - monthValues[0] + 12) % 12 || 12;
  const isConsistent = monthValues.every((value, index) => {
    const next = monthValues[(index + 1) % monthValues.length]!;
    const gap = (next - value + 12) % 12 || 12;
    return gap === firstGap;
  });

  if (isConsistent) {
    return { intervalValue: firstGap, intervalUnit: 'month' };
  }

  return DEFAULT_INTERVAL_DRAFT;
}

function buildMonthlyCronExpr(firstRunAtMs: number, intervalValue: number): string {
  const date = new Date(firstRunAtMs);
  const monthField = buildMonthField(date.getMonth() + 1, intervalValue);

  return `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${monthField} *`;
}

function buildMonthField(startMonth: number, intervalValue: number): string {
  if (intervalValue <= 1) {
    return '*';
  }

  const months = Array.from({ length: 12 }, (_value, index) => index + 1).filter(
    (month) => (month - startMonth + 12) % intervalValue === 0
  );

  return months.join(',');
}

function parseMonthValues(monthField: string): number[] {
  return monthField
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
    .toSorted((a, b) => a - b);
}
