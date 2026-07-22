/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { BrowserWindow, Input, MenuItemConstructorOptions } from 'electron';
import { Menu, app } from 'electron';

type ApplicationShortcutInput = Pick<Input, 'type' | 'key' | 'isComposing' | 'control' | 'meta' | 'alt' | 'shift'>;

/** Match the native Settings shortcut before Chromium can reinterpret it. */
export const isOpenSettingsShortcut = (
  input: ApplicationShortcutInput,
  platform: NodeJS.Platform = process.platform
): boolean => {
  if (input.type !== 'keyDown' || input.isComposing || input.alt || input.shift || input.key !== ',') {
    return false;
  }

  return platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
};

/**
 * Register application-owned shortcuts on one BrowserWindow. Unlike
 * `globalShortcut`, this listener only runs while the window receives input.
 */
export const attachApplicationShortcutsToWindow = (
  win: BrowserWindow,
  platform: NodeJS.Platform = process.platform
): (() => void) => {
  const handleBeforeInput = (event: Electron.Event, input: Input): void => {
    if (event.defaultPrevented || !isOpenSettingsShortcut(input, platform)) {
      return;
    }

    event.preventDefault();
    if (!input.isAutoRepeat) {
      ipcBridge.application.openSettings.emit();
    }
  };

  win.webContents.on('before-input-event', handleBeforeInput);
  return () => {
    win.webContents.removeListener('before-input-event', handleBeforeInput);
  };
};

export function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }] as MenuItemConstructorOptions[])
        : ([{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'Check for Updates...',
        click: () => {
          ipcBridge.update.open.emit({ source: 'menu' });
        },
      },
    ],
  });

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
