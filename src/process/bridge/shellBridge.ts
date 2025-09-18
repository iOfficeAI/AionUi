/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shell } from 'electron';
import { ipcBridge } from '../../common';

export function initShellBridge(): void {
  ipcBridge.shell.openFile.provider(async (path) => {
    shell.openPath(path);
  });

  ipcBridge.shell.showItemInFolder.provider(async (path) => {
    shell.showItemInFolder(path);
  });

  ipcBridge.shell.openExternal.provider(async (url) => {
    return shell.openExternal(url);
  });
}
