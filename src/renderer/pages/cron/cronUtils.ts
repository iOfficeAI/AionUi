/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/adapter/ipcBridge';
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
 * Format next run time for display
 */
export function formatNextRun(nextRunAtMs?: number): string {
  if (!nextRunAtMs) return '-';
  const date = new Date(nextRunAtMs);
  return date.toLocaleString();
}

/**
 * Get job status flags
 */
export function getJobStatusFlags(job: ICronJob): { hasError: boolean; isPaused: boolean } {
  return {
    hasError: job.state.lastStatus === 'error',
    isPaused: !job.enabled,
  };
}
