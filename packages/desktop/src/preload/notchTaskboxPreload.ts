/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';

type TaskboxRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

contextBridge.exposeInMainWorld('aionuiTaskbox', {
  request: (path: string, options?: TaskboxRequestOptions) =>
    ipcRenderer.invoke('notch-taskbox:request', { path, options }),
  onExpandedChange: (callback: (expanded: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, expanded: boolean) => callback(expanded);
    ipcRenderer.on('notch-taskbox:expanded', handler);
    return () => {
      ipcRenderer.off('notch-taskbox:expanded', handler);
    };
  },
});
