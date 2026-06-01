/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC handler for collecting and compressing recent log files
 * for the bug report feature.
 */

import * as electron from 'electron';

const { ipcMain, app, BrowserWindow } = electron;
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { resolveDesktopSentryConfig } from '@/common/config/sentry';

/**
 * Get log file paths for the last N days.
 * Log files are named YYYY-MM-DD.log by electron-log.
 */
const getRecentLogPaths = (logsDir: string, days: number): string[] => {
  const paths: string[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    for (const filename of [`${dateStr}.log`, `${dateStr}.backend.log`, `${dateStr}.aionrs.log`]) {
      const filePath = path.join(logsDir, filename);
      if (fs.existsSync(filePath)) {
        paths.push(filePath);
      }
    }
  }

  return paths;
};

const LOG_DAYS = 3;
const FEEDBACK_FLUSH_TIMEOUT_MS = 8000;

ipcMain.handle('feedback:collect-logs', async () => {
  try {
    let logsDir: string;
    try {
      logsDir = app.getPath('logs');
    } catch {
      logsDir = path.join(app.getPath('userData'), 'logs');
    }

    if (!fs.existsSync(logsDir)) {
      return null;
    }

    const logPaths = getRecentLogPaths(logsDir, LOG_DAYS);
    if (logPaths.length === 0) {
      return null;
    }

    // Read and concatenate all log files with date headers
    const parts: string[] = [];
    for (const logPath of logPaths) {
      const basename = path.basename(logPath);
      const content = fs.readFileSync(logPath, 'utf-8');
      parts.push(`=== ${basename} ===\n${content}\n`);
    }

    const combined = parts.join('\n');
    const compressed = zlib.gzipSync(Buffer.from(combined, 'utf-8'));

    // Return as number array for IPC serialization (Buffer is not serializable)
    return {
      filename: 'logs.gz',
      data: Array.from(compressed),
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to collect logs:', error);
    return null;
  }
});

ipcMain.handle('feedback:capture-screenshot', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return null;
    }

    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    if (!png || png.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `screenshot-${timestamp}.png`,
      data: Array.from(png),
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to capture screenshot:', error);
    return null;
  }
});

ipcMain.handle(
  'feedback:submit',
  async (
    _event,
    payload: {
      module: string;
      summary: string;
      description: string;
      logs?: { filename: string; data: number[] } | null;
      screenshots?: Array<{ filename: string; data: number[]; contentType: string }>;
    }
  ) => {
    const sentryConfig = resolveDesktopSentryConfig(process.env as Record<string, string | undefined>);
    if (!sentryConfig.enabled || !sentryConfig.dsn) {
      throw new Error('desktop_sentry_not_configured');
    }

    const Sentry = await import('@sentry/electron/main');
    const attachments: Array<{ filename: string; data: Uint8Array; contentType: string }> = [];

    if (payload.logs?.data?.length) {
      attachments.push({
        filename: payload.logs.filename || 'logs.gz',
        data: new Uint8Array(payload.logs.data),
        contentType: 'application/gzip',
      });
    }

    for (const screenshot of payload.screenshots ?? []) {
      if (!screenshot?.data?.length) continue;
      attachments.push({
        filename: screenshot.filename,
        data: new Uint8Array(screenshot.data),
        contentType: screenshot.contentType || 'image/png',
      });
    }

    Sentry.withScope((scope) => {
      scope.setTag('brand', sentryConfig.brand);
      scope.setTag('type', 'user-feedback');
      scope.setTag('module', payload.module);

      Sentry.captureEvent(
        {
          level: 'info',
          message: payload.summary,
          extra: {
            description: payload.description,
          },
        },
        { attachments }
      );
    });

    const flushed = await Sentry.flush(FEEDBACK_FLUSH_TIMEOUT_MS);
    if (!flushed) {
      throw new Error('desktop_sentry_flush_timeout');
    }

    return { ok: true };
  }
);
