/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Sentry from '@sentry/electron/main';
import { app, type BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import { getOrCreateAnalyticsId } from './process/utils/analyticsId';

// 抑制 Chromium GPU 崩溃噪声（参见 ELECTRON-9A / ELECTRON-9D）：
// 自愈逻辑在 gpuRecovery 中处理，事件流量已无价值。
const GPU_CRASH_DROP_PATTERNS = [/'GPU' process exited with /, /IntentionallyCrashBrowserForUnusableGpuProcess/];

export function initSentry(): void {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: app.isPackaged ? 'production' : 'development',
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

/**
 * How many recent days of logs the next startup report packs. Aligned with
 * the 24h throttle: the previous report covers everything older, so each
 * launch only needs the last calendar day. The app always writes today's
 * log on startup, so this slice is never empty in practice.
 */
const REPORT_DAYS = 1;

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
  const days = Array.from(byDay.keys()).toSorted().toReversed().slice(0, n);
  return days.flatMap((d) => byDay.get(d) ?? []).toSorted((a, b) => a.mtime - b.mtime);
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

const STATE_FILE = 'sentry-log-report-state.json';
const ATTACHMENT_CAP_BYTES = 19 * 1024 * 1024;
const STARTUP_DELAY_MS = 30_000;
const THROTTLE_WINDOW_MS = 24 * 60 * 60 * 1000;

type State = { lastReportAt?: number };

function readState(): State {
  try {
    const p = path.join(app.getPath('userData'), STATE_FILE);
    return JSON.parse(fs.readFileSync(p, 'utf8')) as State;
  } catch {
    return {};
  }
}

function writeState(state: State): void {
  try {
    const p = path.join(app.getPath('userData'), STATE_FILE);
    fs.writeFileSync(p, JSON.stringify(state), 'utf8');
  } catch {
    // best-effort; failure to persist throttle state is not fatal
  }
}

function listLogFilesSync(dir: string): LogFileMeta[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: LogFileMeta[] = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile() && name.endsWith('.log')) {
        out.push({ path: full, mtime: stat.mtimeMs, size: stat.size });
      }
    } catch {
      // skip unreadable entries
    }
  }
  return out;
}

class UnretryableError extends Error {}
class RetryableError extends Error {}

async function runStartupLogReport(): Promise<void> {
  const now = Date.now();
  const state = readState();

  if (state.lastReportAt && now - state.lastReportAt < THROTTLE_WINDOW_MS) {
    const remainingHours = ((THROTTLE_WINDOW_MS - (now - state.lastReportAt)) / 3_600_000).toFixed(1);
    console.info(`[sentry] startup log report skipped (throttled, next attempt in ~${remainingHours}h)`);
    return;
  }

  // DSN gate goes first so we don't read the disk for nothing.
  // Don't write state — the next launch with a DSN should still fire.
  if (!process.env.SENTRY_DSN) {
    console.info('[sentry] startup log report skipped (SENTRY_DSN not set)');
    throw new UnretryableError('no DSN');
  }

  const logsRoot = app.getPath('logs');
  const frontendFiles = listLogFilesSync(logsRoot);
  const backendFiles = listLogFilesSync(path.join(logsRoot, 'logs'));
  const all = [...frontendFiles, ...backendFiles];
  if (all.length === 0) {
    writeState({ lastReportAt: now });
    throw new UnretryableError('no log files');
  }

  const selected = selectRecentLogFiles(all, REPORT_DAYS);
  if (selected.length === 0) {
    writeState({ lastReportAt: now });
    throw new UnretryableError('no non-empty logs');
  }

  let segments: LogSegment[];
  try {
    segments = selected.map((f) => ({
      name: path.basename(f.path),
      mtime: f.mtime,
      content: fs.readFileSync(f.path, 'utf8'),
    }));
  } catch (err) {
    throw new RetryableError(`read failed: ${(err as Error).message}`);
  }

  let pack: PackResult;
  try {
    pack = packAndCap(segments, ATTACHMENT_CAP_BYTES);
  } catch (err) {
    throw new RetryableError(`gzip failed: ${(err as Error).message}`);
  }

  Sentry.withScope((scope) => {
    scope.addAttachment({
      filename: 'aionui-logs.log.gz',
      data: pack.gzipped,
      contentType: 'application/gzip',
    });
    scope.setExtra('truncated', pack.truncated);
    scope.setExtra('days_covered', REPORT_DAYS);
    Sentry.captureMessage('startup-log-report', 'info');
  });

  writeState({ lastReportAt: now });
  const sizeKb = (pack.gzipped.length / 1024).toFixed(1);
  console.info(
    `[sentry] startup log report sent (days=${REPORT_DAYS}, files=${selected.length}, gzipped=${sizeKb}KB, truncated=${pack.truncated})`
  );
}

/**
 * Schedule a one-shot startup log report 30s after the renderer finishes
 * loading. Best-effort: any failure is logged to console only and never
 * affects app startup.
 *
 * Failure semantics: `UnretryableError` paths (other than missing DSN) update
 * `lastReportAt` before throwing so the skip persists for 24h. `RetryableError`
 * and the missing-DSN path leave `lastReportAt` untouched so the next launch
 * retries.
 */
export function scheduleStartupLogReport(window: BrowserWindow): void {
  const trigger = () => {
    setTimeout(() => {
      runStartupLogReport().catch((err) => {
        console.error('[sentry] startup log report failed:', err);
      });
    }, STARTUP_DELAY_MS);
  };

  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', trigger);
  } else {
    trigger();
  }
}
