/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * System Tray Service
 *
 * Manages the system tray icon and context menu, allowing the app to run
 * in the background when the window is closed. Backend processes (workers,
 * cron jobs, channels) continue running while the UI is hidden.
 */

import type { BrowserWindow } from 'electron';
import { app, Menu, nativeImage, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let tray: Tray | null = null;
let isQuitting = false;

/**
 * Resolve the icon path for the system tray based on platform and packaging state.
 */
function getIconPath(): string {
  if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'));
    if (process.platform === 'win32') {
      return path.join(exeDir, 'resources', 'app.ico');
    }
    if (process.platform === 'darwin') {
      return path.join(exeDir, '..', 'Resources', 'icon.png');
    }
    // Linux
    return path.join(exeDir, 'resources', 'icon.png');
  }

  // Development
  if (process.platform === 'win32') {
    return path.join(process.cwd(), 'resources', 'app.ico');
  }
  return path.join(process.cwd(), 'resources', 'icon.png');
}

/**
 * Create and return a properly sized native image for the tray icon.
 */
function createTrayIcon(): Electron.NativeImage {
  const iconPath = getIconPath();
  let icon = nativeImage.createFromPath(iconPath);

  // Fallback to app.png if primary icon not found
  if (icon.isEmpty()) {
    const fallbackPath = app.isPackaged ? path.join(path.dirname(app.getPath('exe')), process.platform === 'darwin' ? path.join('..', 'Resources', 'app.png') : path.join('resources', 'app.png')) : path.join(process.cwd(), 'resources', 'app.png');

    if (fs.existsSync(fallbackPath)) {
      icon = nativeImage.createFromPath(fallbackPath);
    }
  }

  // Resize for system tray (16x16 is universally compatible)
  return icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 });
}

/**
 * Show and focus the main window, restoring it if minimized.
 */
function showWindow(window: BrowserWindow | null): void {
  if (!window) return;
  if (!window.isVisible()) {
    window.show();
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
}

/**
 * Initialize the system tray icon and context menu.
 *
 * @param getMainWindow - Function that returns the current main BrowserWindow (or null)
 */
export function initTray(getMainWindow: () => BrowserWindow | null): void {
  const icon = createTrayIcon();
  if (icon.isEmpty()) {
    console.warn('[TrayService] Could not load tray icon, skipping tray creation');
    return;
  }

  tray = new Tray(icon);
  tray.setToolTip('AionUi');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show AionUi',
      click: () => showWindow(getMainWindow()),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Left-click on tray icon shows the window (Windows/Linux primary interaction)
  tray.on('click', () => {
    showWindow(getMainWindow());
  });
}

/**
 * Set up the window close interceptor so closing hides the window
 * instead of destroying it, keeping backend processes alive.
 *
 * @param window - The BrowserWindow to intercept close events on
 */
export function interceptWindowClose(window: BrowserWindow): void {
  window.on('close', (event: Electron.Event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
}

export function setQuitting(value: boolean): void {
  isQuitting = value;
}

export function getIsQuitting(): boolean {
  return isQuitting;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
