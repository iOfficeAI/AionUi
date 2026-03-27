/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shell } from 'electron';
import { ipcBridge } from '@/common';

export function initShellBridge(): void {
  ipcBridge.shell.openFile.provider(async (path) => {
    await shell.openPath(path);
  });

  ipcBridge.shell.showItemInFolder.provider((path) => {
    shell.showItemInFolder(path);
    return Promise.resolve();
  });

  ipcBridge.shell.openExternal.provider((url) => {
    try {
      new URL(url);
    } catch {
      console.warn(`[shellBridge] Invalid URL passed to openExternal: ${url}`);
      return Promise.resolve();
    }
    return shell.openExternal(url);
  });
}
