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

import { Notification, app } from 'electron';
import type { BrowserWindow } from 'electron';
import { ipcBridge } from '@/common';
import { ProcessConfig } from '@process/utils/initStorage';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
// Keep a strong reference to active notifications to prevent GC before macOS renders them
const activeNotifications = new Set<Notification>();

/**
 * Get app icon path for notifications
 */
const getNotificationIcon = (): string | undefined => {
  try {
    const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
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
 * Set main window reference (called by index.ts)
 */
export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * Show a system notification.
 * Can be called directly from main process or via IPC from renderer.
 */
export async function showNotification({
  title,
  body,
  conversationId,
}: {
  title: string;
  body: string;
  conversationId?: string;
}): Promise<void> {
  // Check if notification is enabled
  const notificationEnabled = await ProcessConfig.get('system.notificationEnabled');
  if (notificationEnabled === false) {
    return;
  }

  if (!Notification.isSupported()) {
    console.warn('[Notification] System notifications are not supported on this platform');
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn('[Notification] Main window is not available, notification click will not work');
  }

  const iconPath = getNotificationIcon();

  try {
    const notification = new Notification({
      title,
      body,
      icon: iconPath,
      silent: false,
    });

    // Prevent GC from collecting the notification before macOS renders it
    activeNotifications.add(notification);
    const release = () => activeNotifications.delete(notification);

    notification.on('click', () => {
      release();
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();

        if (conversationId) {
          console.log('[Notification] Clicked, navigating to conversation:', conversationId);
          ipcBridge.notification.clicked.emit({ conversationId });
        }
      } else {
        console.warn('[Notification] Main window not available on click');
      }
    });

    notification.on('failed', (error) => {
      release();
      console.error('[Notification] Failed to show:', error);
    });

    notification.on('close', () => {
      release();
    });

    notification.show();
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
