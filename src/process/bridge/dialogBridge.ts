/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions, WebContents } from 'electron';
import { ipcBridge } from '../../common';

const DIRECT_SHOW_OPEN_CHANNEL = 'dialog-direct-show-open';

type ShowOpenDialogRequest = {
  defaultPath?: string;
  properties?: OpenDialogOptions['properties'];
  filters?: OpenDialogOptions['filters'];
};

export const normalizeShowOpenOptions = (options?: ShowOpenDialogRequest): OpenDialogOptions => {
  const defaultPath = options?.defaultPath?.trim();

  return {
    defaultPath: defaultPath || undefined,
    properties: options?.properties,
    filters: options?.filters,
  };
};

export const resolveDialogParentWindow = (sender?: WebContents | null): BrowserWindow | undefined => {
  if (sender) {
    const senderWindow = BrowserWindow.fromWebContents(sender);
    if (senderWindow && !senderWindow.isDestroyed()) {
      return senderWindow;
    }
  }

  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    return focusedWindow;
  }

  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
};

const showOpenDialogWithWindow = async (sender: WebContents | null | undefined, options?: ShowOpenDialogRequest): Promise<string[] | undefined> => {
  const parentWindow = resolveDialogParentWindow(sender);
  const dialogOptions = normalizeShowOpenOptions(options);
  const result = parentWindow ? await dialog.showOpenDialog(parentWindow, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  return result.filePaths;
};

export function initDialogBridge(): void {
  ipcBridge.dialog.showOpen.provider((options) => showOpenDialogWithWindow(undefined, options));

  ipcMain.removeHandler(DIRECT_SHOW_OPEN_CHANNEL);
  ipcMain.handle(DIRECT_SHOW_OPEN_CHANNEL, async (event, options?: ShowOpenDialogRequest) => {
    return showOpenDialogWithWindow(event.sender, options);
  });
}
