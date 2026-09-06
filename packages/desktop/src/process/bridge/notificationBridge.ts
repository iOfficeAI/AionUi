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
import { getDetachedWindowRegistry } from '@process/services/detachedWindowRegistry';
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

const getLiveMainWindow = (): BrowserWindow | null =>
  mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null;

const getNotificationProducer = (): BrowserWindow | null =>
  getLiveMainWindow() ?? [...appWindows].find((win) => !win.isDestroyed()) ?? null;

const revealNotificationWindow = (win: BrowserWindow): void => {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
};

const focusDetachedConversation = (conversationId: string | undefined): boolean => {
  if (!conversationId) return false;
  try {
    return getDetachedWindowRegistry().focusConversation(conversationId);
  } catch {
    return false;
  }
};

/**
 * Open the notification's own conversation. This branch is only reached with no
 * live main window, so every remaining app window is a detached window pinned to
 * a different conversation: revealing one would answer a click about
 * conversation A by raising conversation B. A failure is therefore reported and
 * nothing is revealed, rather than silently surfacing the wrong conversation.
 */
const openDetachedConversation = (conversationId: string): void => {
  try {
    void getDetachedWindowRegistry()
      .openConversation(conversationId)
      .catch((error) => {
        console.error('[Notification] Failed to open notification conversation:', error);
      });
  } catch (error) {
    console.error('[Notification] Failed to open notification conversation:', error);
  }
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
 * clicking it first focuses an existing detached owner. Otherwise it asks the
 * main window to navigate, or opens the exact detached conversation when no
 * main window exists.
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
    const producer = getNotificationProducer();
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
        if (focusDetachedConversation(conversation_id)) return;
        const win = getLiveMainWindow();
        if (win) {
          revealNotificationWindow(win);
          ipcBridge.notification.clicked.emit({ conversation_id });
          return;
        }
        if (conversation_id) {
          openDetachedConversation(conversation_id);
          return;
        }
        const producer = getNotificationProducer();
        if (producer) revealNotificationWindow(producer);
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
