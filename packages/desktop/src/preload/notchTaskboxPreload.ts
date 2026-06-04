/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { NotchTaskboxBridgeEvent, NotchTaskboxStatus } from '@process/notchTaskbox/notchTaskboxTypes';

type TaskboxRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

contextBridge.exposeInMainWorld('aionuiTaskbox', {
  request: (path: string, options?: TaskboxRequestOptions) =>
    ipcRenderer.invoke('notch-taskbox:request', { path, options }),
  setExpanded: (expanded: boolean) => ipcRenderer.invoke('notch-taskbox:set-expanded', expanded),
  openMainWindow: () => ipcRenderer.invoke('notch-taskbox:open-main-window'),
  onBridgeEvent: (callback: (event: NotchTaskboxBridgeEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: NotchTaskboxBridgeEvent) => callback(data);
    ipcRenderer.on('notch-taskbox:event', handler);
    return () => {
      ipcRenderer.off('notch-taskbox:event', handler);
    };
  },
  onExpandedChange: (callback: (expanded: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, expanded: boolean) => callback(expanded);
    ipcRenderer.on('notch-taskbox:expanded', handler);
    return () => {
      ipcRenderer.off('notch-taskbox:expanded', handler);
    };
  },
  onStatus: (callback: (status: NotchTaskboxStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: NotchTaskboxStatus) => callback(status);
    ipcRenderer.on('notch-taskbox:status', handler);
    return () => {
      ipcRenderer.off('notch-taskbox:status', handler);
    };
  },
});
