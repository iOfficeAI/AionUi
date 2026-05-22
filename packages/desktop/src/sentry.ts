/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { gzipSync } from 'node:zlib';
import { getOrCreateAnalyticsId } from './process/utils/analyticsId';

// 抑制 Chromium GPU 崩溃噪声（参见 ELECTRON-9A / ELECTRON-9D）：
// 自愈逻辑在 gpuRecovery 中处理，事件流量已无价值。
const GPU_CRASH_DROP_PATTERNS = [/'GPU' process exited with /, /IntentionallyCrashBrowserForUnusableGpuProcess/];

export function initSentry(): void {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend(event) {
      const haystacks: string[] = [];
      if (event.message) haystacks.push(event.message);
      const exceptions = event.exception?.values ?? [];
      for (const ex of exceptions) {
        if (ex.value) haystacks.push(ex.value);
        const frames = ex.stacktrace?.frames ?? [];
        for (const frame of frames) {
          if (frame.function) haystacks.push(frame.function);
        }
      }
      if (GPU_CRASH_DROP_PATTERNS.some((re) => haystacks.some((h) => re.test(h)))) {
        return null;
      }
      return event;
    },
  });

  Sentry.setTag('app.arch', process.arch);
  Sentry.setTag('app.version', app.getVersion());
  Sentry.setTag('os.name', process.platform);
}

/**
 * Attach the persistent anonymous installation id to the active Sentry scope
 * so every subsequent event (crashes, feedback, startup log report) carries
 * a stable device identifier.
 */
export function setSentryDeviceId(): void {
  const id = getOrCreateAnalyticsId();
  Sentry.setUser({ id });
  Sentry.setTag('device_id', id);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How many recent days of logs the next startup report should pack.
 *
 * - First-ever launch (`lastReportAt === undefined`): 7 days.
 * - Subsequent launches: ceil(elapsed / 24h), clamped to [1, 7].
 *
 * Throttle gating (skip-if-within-24h) is enforced by `runStartupLogReport`,
 * not here — this helper just decides the slice size once gating passes.
 */
export function computeReportDays(lastReportAt: number | undefined, now: number): number {
  if (lastReportAt === undefined) return 7;
  const elapsedDays = Math.ceil((now - lastReportAt) / MS_PER_DAY);
  return Math.min(Math.max(elapsedDays, 1), 7);
}

export type LogFileMeta = { path: string; mtime: number; size: number };

/**
 * Pick the N most recent calendar days that contain non-empty log files,
 * and return every file falling on those days. Backend + frontend logs for
 * the same day stay together so the gzip bundle is coherent.
 */
export function selectRecentLogFiles(files: LogFileMeta[], n: number): LogFileMeta[] {
  const nonEmpty = files.filter((f) => f.size > 0);
  const byDay = new Map<string, LogFileMeta[]>();
  for (const f of nonEmpty) {
    const day = new Date(f.mtime).toISOString().slice(0, 10);
    let bucket = byDay.get(day);
    if (!bucket) {
      bucket = [];
      byDay.set(day, bucket);
    }
    bucket.push(f);
  }
  const days = Array.from(byDay.keys()).sort().reverse().slice(0, n);
  return days.flatMap((d) => byDay.get(d) ?? []).sort((a, b) => a.mtime - b.mtime);
}

export type LogSegment = { name: string; mtime: number; content: string };
export type PackResult = { gzipped: Buffer; truncated: boolean };

/**
 * Concatenate segments with a per-file header, gzip them, and shrink-from-head
 * until the gzipped size fits `maxBytes`. The tail (newest content) survives
 * because Sentry users care most about recent activity around the crash.
 */
export function packAndCap(segments: LogSegment[], maxBytes: number): PackResult {
  const headers = segments.map((s) => `===== ${s.name} (mtime: ${new Date(s.mtime).toISOString()}) =====\n`);
  let combined = '';
  for (let i = 0; i < segments.length; i++) {
    combined += headers[i] + segments[i].content;
    if (i < segments.length - 1) combined += '\n';
  }

  let gzipped = gzipSync(combined);
  if (gzipped.length <= maxBytes) {
    return { gzipped, truncated: false };
  }

  let truncated = combined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const ratio = gzipped.length / Math.max(truncated.length, 1);
    const targetUncompressed = Math.max(Math.floor((maxBytes / ratio) * 0.9), 1024);
    if (truncated.length <= targetUncompressed) {
      truncated = truncated.slice(Math.floor(truncated.length * 0.3));
    } else {
      truncated = truncated.slice(truncated.length - targetUncompressed);
    }
    gzipped = gzipSync(truncated);
    if (gzipped.length <= maxBytes) {
      return { gzipped, truncated: true };
    }
  }

  truncated = truncated.slice(-Math.floor(maxBytes / 2));
  gzipped = gzipSync(truncated);
  return { gzipped, truncated: true };
}
