/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { app, Menu, nativeImage, Tray } from 'electron';
import * as path from 'path';
import i18n from '@process/services/i18n';
import { workerTaskManager } from '../task/workerTaskManagerSingleton';

let tray: Tray | null = null;
let closeToTrayEnabled = false;
let isQuitting = false;
let mainWindowRef: BrowserWindow | null = null;

export const setTrayMainWindow = (win: BrowserWindow): void => {
  mainWindowRef = win;
};

export const getCloseToTrayEnabled = (): boolean => closeToTrayEnabled;

export const setCloseToTrayEnabled = (enabled: boolean): void => {
  closeToTrayEnabled = enabled;
};

export const getIsQuitting = (): boolean => isQuitting;

export const setIsQuitting = (quitting: boolean): void => {
  isQuitting = quitting;
};

/**
 * Get tray icon.
 * macOS uses Template image to adapt to dark/light menu bar.
 */
const getTrayIcon = (): Electron.NativeImage => {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
  const icon = nativeImage.createFromPath(path.join(resourcesPath, 'app.png'));
  if (process.platform === 'darwin') {
    return icon.resize({ width: 16, height: 16 });
  }
  return icon.resize({ width: 32, height: 32 });
};

/**
 * Build tray context menu (async to support dynamic content).
 */
const buildTrayContextMenu = async (): Promise<Electron.Menu> => {
  const getRecentConversations = async (): Promise<Array<{ id: string; title: string }>> => {
    try {
      const { getDatabase } = await import('@process/services/database');
      const db = getDatabase();
      const result = db.getUserConversations(undefined, 0, 5);
      return (result.data || [])
        .slice(0, 5)
        .map((conv) => ({ id: conv.id, title: conv.name || i18n.t('common.tray.untitled') }));
    } catch {
      return [];
    }
  };

  const getRunningTasksCount = (): number => {
    try {
      return workerTaskManager.listTasks().length;
    } catch {
      return 0;
    }
  };

  const recentConversations = await getRecentConversations();
  const runningTasksCount = getRunningTasksCount();

  const showAndFocus = () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      if (process.platform === 'darwin' && app.dock) {
        void app.dock.show();
      }
      if (mainWindowRef.isMinimized()) {
        mainWindowRef.restore();
      }
      mainWindowRef.show();
      mainWindowRef.focus();
    }
  };

  const hideToTray = () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.hide();
      if (process.platform === 'darwin' && app.dock) {
        void app.dock.hide();
      }
    }
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: i18n.t('common.tray.showWindow'),
      click: showAndFocus,
    },
    {
      label: i18n.t('common.tray.closeToTray'),
      click: hideToTray,
    },
    { type: 'separator' },
    {
      label: i18n.t('common.tray.newChat'),
      click: () => {
        showAndFocus();
        mainWindowRef?.webContents.send('tray:navigate-to-guid');
      },
    },
  ];

  if (recentConversations.length > 0) {
    template.push({ type: 'separator' });
    template.push({
      label: i18n.t('common.tray.recentChats'),
      enabled: false,
    });
    for (const conv of recentConversations) {
      const displayTitle = conv.title.length > 20 ? conv.title.slice(0, 20) + '...' : conv.title;
      template.push({
        label: displayTitle,
        click: () => {
          showAndFocus();
          mainWindowRef?.webContents.send('tray:navigate-to-conversation', { conversationId: conv.id });
        },
      });
    }
  }

  template.push({ type: 'separator' });
  template.push({
    label: `${i18n.t('common.tray.runningTasks')}: ${runningTasksCount}`,
    enabled: false,
  });
  template.push({
    label: i18n.t('common.tray.pauseAll'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:pause-all-tasks');
    },
  });

  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.checkUpdate'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:check-update');
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.about'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:open-about');
    },
  });
  template.push({
    label: i18n.t('common.tray.restart'),
    click: () => {
      isQuitting = true;
      app.relaunch();
      app.exit(0);
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.quit'),
    click: () => {
      isQuitting = true;
      app.quit();
    },
  });

  return Menu.buildFromTemplate(template);
};

/**
 * Create system tray (idempotent — no-op if already exists).
 */
export const createOrUpdateTray = (): void => {
  if (tray) {
    return;
  }
  try {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('AionUi');
    void buildTrayContextMenu().then((menu) => tray?.setContextMenu(menu));

    tray.on('double-click', () => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        if (process.platform === 'darwin' && app.dock) {
          void app.dock.show();
        }
        if (mainWindowRef.isMinimized()) {
          mainWindowRef.restore();
        }
        mainWindowRef.show();
        mainWindowRef.focus();
      }
    });

    tray.on('click', (event: any) => {
      if (event.event?.button === 2) {
        void buildTrayContextMenu().then((menu) => tray?.setContextMenu(menu));
      }
    });
  } catch (err) {
    console.error('[Tray] Failed to create tray:', err);
  }
};

/**
 * Refresh tray context menu labels (called on language change).
 */
export const refreshTrayMenu = async (): Promise<void> => {
  if (tray) {
    const menu = await buildTrayContextMenu();
    tray.setContextMenu(menu);
  }
};

/**
 * Destroy system tray.
 */
export const destroyTray = (): void => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
};
