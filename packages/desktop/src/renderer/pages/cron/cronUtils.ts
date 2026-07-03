/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import type { TFunction } from 'i18next';

const WEEKDAY_LABEL_KEY_BY_VALUE: Record<string, string> = {
  MON: 'monday',
  TUE: 'tuesday',
  WED: 'wednesday',
  THU: 'thursday',
  FRI: 'friday',
  SAT: 'saturday',
  SUN: 'sunday',
};

function formatTime(hour: string, minute: string): string {
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function formatCronExpr(expr: string, t: TFunction): string | null {
  if (!expr) return t('cron.page.scheduleDesc.manual');

  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const normalizedDayOfWeek = dayOfWeek.toUpperCase();
  const time = formatTime(hour, minute);

  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return t('cron.page.scheduleDesc.hourly');
  }

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && hour !== '*' && minute !== '*') {
    return t('cron.page.scheduleDesc.dailyAt', { time });
  }

  if (dayOfMonth === '*' && month === '*' && normalizedDayOfWeek === 'MON-FRI') {
    return t('cron.page.scheduleDesc.weekdaysAt', { time });
  }

  const weekdayKey = WEEKDAY_LABEL_KEY_BY_VALUE[normalizedDayOfWeek];
  if (dayOfMonth === '*' && month === '*' && weekdayKey) {
    return t('cron.page.scheduleDesc.weeklyAt', {
      day: t(`cron.page.weekday.${weekdayKey}`),
      time,
    });
  }

  return null;
}

/**
 * Format schedule for display - use human-readable description
 */
export function formatSchedule(job: ICronJob, t: TFunction): string {
  if (job.schedule.kind === 'cron') {
    return formatCronExpr(job.schedule.expr, t) ?? job.schedule.description;
  }

  if (job.schedule.kind === 'every' && job.schedule.everyMs === 3600000) {
    return t('cron.page.scheduleDesc.hourly');
  }

  return job.schedule.description;
}

/**
 * Resolve the current IANA time zone for cron scheduling.
 * Falls back to UTC when the environment cannot provide a valid identifier.
 */
export function getCurrentCronTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone && timeZone.trim() ? timeZone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Build a cron schedule payload anchored to the current local time zone.
 */
export function createCronSchedule(expr: string, description: string): Extract<ICronJob['schedule'], { kind: 'cron' }> {
  return {
    kind: 'cron',
    expr,
    tz: getCurrentCronTimeZone(),
    description,
  };
}

/**
 * Format next run time for display
 */
export function formatNextRun(next_run_at_ms?: number): string {
  if (!next_run_at_ms) return '-';
  const date = new Date(next_run_at_ms);
  return date.toLocaleString();
}

function formatTwoDigit(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatCronRunConversationTitle(jobName: string, runAtMs: number): string {
  const date = new Date(runAtMs);
  const day = formatTwoDigit(date.getDate());
  const month = formatTwoDigit(date.getMonth() + 1);
  const year = formatTwoDigit(date.getFullYear() % 100);
  return `${jobName.trim()} ${day}-${month}-${year}`;
}

/**
 * Get job status flags
 */
export function getJobStatusFlags(job: ICronJob): { hasError: boolean; isPaused: boolean } {
  return {
    hasError: job.state.last_status === 'error' || job.state.last_status === 'missed',
    isPaused: !job.enabled,
  };
}

export function resolveCronJobId(extra: TChatConversation['extra'] | undefined): string | undefined {
  const maybeExtra = extra as { cron_job_id?: unknown; cronJobId?: unknown } | undefined;
  const snakeCase = maybeExtra?.cron_job_id;
  if (typeof snakeCase === 'string' && snakeCase.trim()) return snakeCase;
  const camelCase = maybeExtra?.cronJobId;
  if (typeof camelCase === 'string' && camelCase.trim()) return camelCase;
  return undefined;
}
