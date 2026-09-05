/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * System Notification Module
 *
 * Provides showNotification() for direct use in main process,
 * and registers an IPC provider so renderer can invoke it cross-process.
 */

import { getPlatformServices } from '@/common/platform';
import { ipcBridge } from '@/common';
import { electronNotification } from '@/common/electronSafe';
import { ProcessConfig } from '@process/utils/initStorage';
import type { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

// Main window reference, used to focus + navigate on notification click.
let mainWindowRef: BrowserWindow | null = null;

/**
 * Every app window that can show a conversation. Pet windows are deliberately
 * absent: the pet is always-on-top decoration, not a place the user reads
 * replies, so its focus must not suppress a notification.
 */
const appWindows = new Set<BrowserWindow>();

/**
 * Register a window as one the user can read conversations in. Its focus
 * suppresses notifications, the same way the main window's always has.
 */
export const registerNotificationAppWindow = (win: BrowserWindow): void => {
  if (appWindows.has(win)) return;
  appWindows.add(win);
  win.once('closed', () => appWindows.delete(win));
};

export const setNotificationMainWindow = (win: BrowserWindow): void => {
  // Recreating the main window (macOS `activate` after every window closed)
  // must not leave the previous one behind suppressing notifications.
  if (mainWindowRef) appWindows.delete(mainWindowRef);
  mainWindowRef = win;
  registerNotificationAppWindow(win);
};

/** Test hook: forget the registered app windows. */
export const resetNotificationAppWindowsForTest = (): void => {
  appWindows.clear();
  mainWindowRef = null;
};

/**
 * True while the user is looking at any app window. With one window this is
 * exactly `mainWindow.isFocused()`; with a detached conversation window open it
 * also covers the case where that window, not the main one, has focus.
 */
const isAnyAppWindowFocused = (): boolean => {
  for (const win of appWindows) {
    if (!win.isDestroyed() && win.isFocused()) return true;
  }
  return false;
};

/**
 * Get app icon path for notifications
 */
const getNotificationIcon = (): string | undefined => {
  try {
    const resourcesPath = getPlatformServices().paths.isPackaged()
      ? process.resourcesPath
      : path.join(process.cwd(), 'resources');
    const iconPath = path.join(resourcesPath, 'app.png');
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  } catch {
    // Ignore icon error, notification will still show
  }
  return undefined;
};

/**
 * Show a system notification.
 * Can be called directly from main process or via IPC from renderer.
 *
 * Skips when `system.notificationEnabled` is off, or when the main window is
 * already focused (no nagging). When a real Electron notification is available,
 * clicking it focuses the main window and emits `notification.clicked` so the
 * renderer can navigate to the originating conversation.
 *
 * In non-Electron mode this falls back to the platform service, which is a no-op.
 */
export async function showNotification({
  title,
  body,
  conversation_id,
  source_web_contents_id,
}: {
  title: string;
  body: string;
  conversation_id?: string;
  source_web_contents_id?: number | null;
}): Promise<void> {
  // Check if notification is enabled
  const notificationEnabled = await ProcessConfig.get('system.notificationEnabled');
  if (notificationEnabled === false) {
    console.log('[Notification] Skipped: notifications are disabled in settings');
    return;
  }

  if (source_web_contents_id !== undefined) {
    const producer = [...appWindows].find((win) => !win.isDestroyed());
    if (source_web_contents_id === null || producer?.webContents.id !== source_web_contents_id) {
      console.log('[Notification] Skipped: another app window owns notification production');
      return;
    }
  }

  // Do not notify while the user is already looking at the app.
  if (isAnyAppWindowFocused()) {
    console.log('[Notification] Skipped: an app window is focused');
    return;
  }

  const iconPath = getNotificationIcon();

  // Prefer a real Electron notification so the click can focus + navigate.
  if (electronNotification) {
    try {
      const notification = new electronNotification({ title, body, ...(iconPath ? { icon: iconPath } : {}) });
      notification.on('click', () => {
        const win = mainWindowRef;
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
        ipcBridge.notification.clicked.emit({ conversation_id });
      });
      notification.show();
      console.log(`[Notification] show() called (isSupported=${electronNotification.isSupported()})`);
    } catch (error) {
      console.error('[Notification] Error creating notification:', error);
    }
    return;
  }

  // Non-Electron fallback (no-op in node mode).
  try {
    getPlatformServices().notification.send({ title, body, icon: iconPath });
  } catch (error) {
    console.error('[Notification] Error creating notification:', error);
  }
}

/**
 * Register IPC provider so renderer can trigger notifications cross-process.
 */
export function initNotificationBridge(): void {
  ipcBridge.notification.show.provider(async (options) => {
    await showNotification(options);
  });
}
