/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LibraryAsset, LibraryFileType } from './types';
import { fileTypeOf } from './libraryService';

export function assetTypes(asset: LibraryAsset): Set<LibraryFileType> {
  return new Set(asset.files.map((f) => fileTypeOf(f.ext)));
}

export interface TimeBucket {
  key: 'today' | 'yesterday' | 'week' | 'month' | 'older';
  i18nKey: string;
}

export function bucketOf(timestamp: number, now: number = Date.now()): TimeBucket {
  const diff = now - timestamp;
  const day = 24 * 3600 * 1000;
  if (diff < day) return { key: 'today', i18nKey: 'library.bucket.today' };
  if (diff < 2 * day) return { key: 'yesterday', i18nKey: 'library.bucket.yesterday' };
  if (diff < 7 * day) return { key: 'week', i18nKey: 'library.bucket.week' };
  if (diff < 30 * day) return { key: 'month', i18nKey: 'library.bucket.month' };
  return { key: 'older', i18nKey: 'library.bucket.older' };
}

export const BUCKET_ORDER: TimeBucket['key'][] = ['today', 'yesterday', 'week', 'month', 'older'];

export function formatRelativeTime(
  t: (key: string, opts?: Record<string, unknown>) => string,
  ts: number,
  now: number = Date.now()
): string {
  const diff = now - ts;
  const minute = 60 * 1000;
  const hour = 3600 * 1000;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  if (diff < hour) {
    const m = Math.max(1, Math.round(diff / minute));
    return t('library.time.minutesAgo', { count: m });
  }
  if (diff < day) return t('library.time.hoursAgo', { count: Math.round(diff / hour) });
  if (diff < week) return t('library.time.daysAgo', { count: Math.round(diff / day) });
  if (diff < month) return t('library.time.weeksAgo', { count: Math.round(diff / week) });
  return t('library.time.monthsAgo', { count: Math.round(diff / month) });
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${M}/${D} ${h}:${m}`;
}
