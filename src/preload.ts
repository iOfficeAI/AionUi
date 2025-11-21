/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';
import { ADAPTER_BRIDGE_EVENT_KEY } from './adapter/constant';

const WINDOW_CONTROL_CHANNELS = {
  minimize: 'window-controls:minimize',
  maximize: 'window-controls:maximize',
  unmaximize: 'window-controls:unmaximize',
  close: 'window-controls:close',
  isMaximized: 'window-controls:is-maximized',
  stateChanged: 'window-controls:maximized-changed',
} as const;

/**
 * @description 注入到renderer进程中, 用于与main进程通信
 * */
contextBridge.exposeInMainWorld('electronAPI', {
  emit: (name: string, data: any) => {
    return ipcRenderer
      .invoke(
        ADAPTER_BRIDGE_EVENT_KEY,
        JSON.stringify({
          name: name,
          data: data,
        })
      )
      .catch((error) => {
        console.error('IPC invoke error:', error);
        throw error;
      });
  },
  on: (callback: any) => {
    const handler = (event: any, value: any) => {
      callback({ event, value });
    };
    ipcRenderer.on(ADAPTER_BRIDGE_EVENT_KEY, handler);
    return () => {
      ipcRenderer.off(ADAPTER_BRIDGE_EVENT_KEY, handler);
    };
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.minimize),
    maximize: () => ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.maximize),
    unmaximize: () => ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.unmaximize),
    close: () => ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.close),
    isMaximized: () => ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.isMaximized),
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: boolean) => callback(state);
      ipcRenderer.on(WINDOW_CONTROL_CHANNELS.stateChanged, handler);
      return () => {
        ipcRenderer.off(WINDOW_CONTROL_CHANNELS.stateChanged, handler);
      };
    },
  },
});
