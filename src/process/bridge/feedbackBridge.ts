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
    const filename = `${date.toISOString().slice(0, 10)}.log`;
    const filePath = path.join(logsDir, filename);
    if (fs.existsSync(filePath)) {
      paths.push(filePath);
    }
  }

  return paths;
};

const LOG_DAYS = 3;

const capturePageWithDebugger = async (browserWindow: BrowserWindow): Promise<Buffer | null> => {
  const debuggerClient = browserWindow.webContents.debugger;
  if (!debuggerClient) {
    return null;
  }

  const shouldDetach = !debuggerClient.isAttached();

  try {
    if (shouldDetach) {
      debuggerClient.attach('1.3');
    }

    await debuggerClient.sendCommand('Page.enable');
    const result = (await debuggerClient.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })) as { data?: string };

    if (!result.data) {
      return null;
    }

    return Buffer.from(result.data, 'base64');
  } catch (error) {
    console.warn('[feedbackBridge] Debugger screenshot failed, falling back to capturePage:', error);
    return null;
  } finally {
    if (shouldDetach) {
      try {
        debuggerClient.detach();
      } catch {
        // Ignore detach failures.
      }
    }
  }
};

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

ipcMain.handle('feedback:capture-current-page', async (event) => {
  try {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) {
      return null;
    }

    const pngBuffer =
      (await capturePageWithDebugger(browserWindow)) ?? (await browserWindow.webContents.capturePage()).toPNG();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    return {
      filename: `page-screenshot-${timestamp}.png`,
      data: Array.from(pngBuffer),
      type: 'image/png',
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to capture current page screenshot:', error);
    return null;
  }
});
