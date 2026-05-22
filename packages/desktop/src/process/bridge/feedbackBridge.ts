/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC handler for collecting and compressing recent log files
 * for the bug report feature.
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const LOG_SUFFIXES = ['.log', '.aioncore.log', '.aionrs.log'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

/**
 * Get log file paths for the most recent N days that actually have logs.
 * Log files are named YYYY-MM-DD.log by electron-log.
 */
const getRecentLogPaths = (logsDir: string, days: number): string[] => {
  const files = fs.readdirSync(logsDir);

  const dates = new Set<string>();
  for (const file of files) {
    const match = DATE_PATTERN.exec(file);
    if (match && LOG_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
      dates.add(match[0]);
    }
  }

  const recentDates = [...dates].toSorted().toReversed().slice(0, days);

  const paths: string[] = [];
  for (const dateStr of recentDates) {
    for (const suffix of LOG_SUFFIXES) {
      const filePath = path.join(logsDir, `${dateStr}${suffix}`);
      if (fs.existsSync(filePath)) {
        paths.push(filePath);
      }
    }
  }

  return paths;
};

const LOG_DAYS = 3;

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
