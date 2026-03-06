/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 系统通知桥接模块
 * System Notification Bridge Module
 *
 * 负责处理系统级通知的显示
 * Handles system-level notifications
 */

import { Notification, app } from 'electron';
import type { BrowserWindow } from 'electron';
import { ipcBridge } from '@/common';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;

/**
 * 获取应用图标路径 / Get app icon path for notifications
 */
const getNotificationIcon = (): string | undefined => {
  try {
    const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
    const iconPath = path.join(resourcesPath, 'app.png');
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  } catch {
    // 忽略图标错误，通知仍会显示 / Ignore icon error, notification will still show
  }
  return undefined;
};

/**
 * 设置主窗口引用（供 index.ts 调用）/ Set main window reference (called by index.ts)
 */
export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export function initNotificationBridge(): void {
  ipcBridge.notification.show.provider(async ({ title, body, conversationId }) => {
    // 检查应用是否支持通知
    if (!Notification.isSupported()) {
      console.warn('[Notification] System notifications are not supported on this platform');
      return;
    }

    // 获取应用图标路径 / Get app icon path
    const iconPath = getNotificationIcon();

    // 创建并显示通知 / Create and show notification
    const notification = new Notification({
      title,
      body,
      icon: iconPath,
      // macOS 特定选项 / macOS specific options
      silent: false, // 播放声音 / Play sound
    });

    // 点击通知时聚焦到主窗口并发送导航事件 / Focus main window and send navigation event when notification is clicked
    notification.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();

        // 发送点击事件到渲染层 / Send click event to renderer
        if (conversationId) {
          ipcBridge.notification.clicked.emit({ conversationId });
        }
      }
    });

    notification.show();
  });
}
