/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { setApplicationMainWindow } from '../bridge/applicationBridge';
import { setNotificationMainWindow } from '../bridge/notificationBridge';
import { setDeepLinkMainWindow } from './deepLink';
import { setTrayMainWindow } from './tray';
import { bindExternalLoginMainWindow } from '../auth';

export const bindMainWindowReferences = (window: BrowserWindow): void => {
  setTrayMainWindow(window);
  setDeepLinkMainWindow(window);
  setApplicationMainWindow(window);
  setNotificationMainWindow(window);
  bindExternalLoginMainWindow(window);
};

export const showAndFocusMainWindow = (window: BrowserWindow): void => {
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
};

export const showOrCreateMainWindow = ({
  mainWindow,
  createWindow,
}: {
  mainWindow: BrowserWindow | null | undefined;
  createWindow: () => void;
}): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showAndFocusMainWindow(mainWindow);
    return;
  }

  createWindow();
};
