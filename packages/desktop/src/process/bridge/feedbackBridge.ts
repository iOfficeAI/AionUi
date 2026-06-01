/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC handler for collecting and compressing recent log files
 * for the bug report feature.
 */

import { ipcMain, app, BrowserWindow, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import * as path from 'path';
import { collectFeedbackLogAttachment } from '../feedback/logs';

const SCREENSHOT_TOKEN_TTL_MS = 60_000;
const screenshotTokens = new Map<string, number>();

const pruneExpiredScreenshotTokens = () => {
  const now = Date.now();
  for (const [token, expiry] of screenshotTokens) {
    if (expiry <= now) {
      screenshotTokens.delete(token);
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

    const attachment = collectFeedbackLogAttachment(logsDir);
    if (!attachment) return null;

    // Return as number array for IPC serialization (Buffer is not serializable)
    return {
      filename: attachment.filename,
      data: Array.from(attachment.data),
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to collect logs:', error);
    return null;
  }
});

ipcMain.handle('feedback:request-screenshot-token', async (event) => {
  pruneExpiredScreenshotTokens();
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(win ?? undefined, {
    type: 'question',
    buttons: ['Allow', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Allow screenshot capture?',
    message: 'Allow Chisl to capture a screenshot for your feedback?',
    detail: 'The screenshot will be attached to this feedback report only.',
  });
  if (result.response !== 0) {
    return null;
  }
  const token = randomUUID();
  screenshotTokens.set(token, Date.now() + SCREENSHOT_TOKEN_TTL_MS);
  return token;
});

ipcMain.handle('feedback:capture-screenshot', async (event, payload: { token?: string } | undefined) => {
  try {
    pruneExpiredScreenshotTokens();
    const token = payload?.token;
    const expiry = token ? screenshotTokens.get(token) : undefined;
    if (!token || !expiry || expiry <= Date.now()) {
      throw new Error('Screenshot capture token is missing or expired');
    }
    screenshotTokens.delete(token);

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
