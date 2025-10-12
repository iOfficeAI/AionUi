/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { dialog } from 'electron';
import { ipcBridge } from '../../common';

export function initDialogBridge(): void {
  ipcBridge.dialog.showOpen.provider((options) => {
    return dialog
      .showOpenDialog({
        defaultPath: options?.defaultPath,
        properties: options?.properties,
      })
      .then((res) => {
        return res.filePaths;
      });
  });
}
