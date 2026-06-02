/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Hook Sentry IPC so the renderer SDK uses ipcRenderer.send instead of falling
// back to fetch('sentry-ipc://...'), which floods the DevTools Network panel.
// Bundled into this preload via `externalizeDepsPlugin({ exclude: [...] })` so
// Electron's sandbox-mode preload doesn't try to resolve it from node_modules.
import '@sentry/electron/preload';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ADAPTER_BRIDGE_EVENT_KEY } from '../common/adapter/constant';
import type {
  AdapterEventMap,
  AdapterEventName,
  AdapterEventResponseMap,
  AdapterMessageCallback,
} from '../common/adapter/events';

/**
 * @description Preload bridge between renderer and main process.
 * */
contextBridge.exposeInMainWorld('electronAPI', {
  emit: <Name extends AdapterEventName>(name: Name, data: AdapterEventMap[Name]) => {
    return (ipcRenderer.invoke(ADAPTER_BRIDGE_EVENT_KEY, { name, data }) as Promise<AdapterEventResponseMap[Name]>).catch(
      (error: unknown) => {
        console.error('IPC invoke error:', error);
        throw error;
      }
    );
  },
  on: (callback: AdapterMessageCallback) => {
    const handler = (_event: Electron.IpcRendererEvent, value: string) => {
      callback({ value });
    };
    ipcRenderer.on(ADAPTER_BRIDGE_EVENT_KEY, handler);
    return () => {
      ipcRenderer.off(ADAPTER_BRIDGE_EVENT_KEY, handler);
    };
  },
  // Get absolute path for dragged file/directory.
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // Feedback: collect and compress recent log files
  collectFeedbackLogs: () => ipcRenderer.invoke('feedback:collect-logs'),
  // Feedback: request consent before capturing a screenshot.
  requestFeedbackScreenshotToken: () => ipcRenderer.invoke('feedback:request-screenshot-token'),
  // Feedback: capture a screenshot of the current window using a one-shot token.
  captureFeedbackScreenshot: (token: string) => ipcRenderer.invoke('feedback:capture-screenshot', { token }),
});

// Synchronously fetch the aioncore port and expose it to the renderer
// via contextBridge (direct window assignment is invisible under contextIsolation).
const backendPort = ipcRenderer.sendSync('get-backend-port') as number;
contextBridge.exposeInMainWorld('__backendPort', backendPort > 0 ? backendPort : 0);

// Tray event listeners - convert IPC events to DOM events
const trayEvents = [
  'tray:navigate-to-guid',
  'tray:navigate-to-conversation',
  'tray:open-about',
  'tray:pause-all-tasks',
  'tray:check-update',
];

for (const channel of trayEvents) {
  ipcRenderer.on(channel, (_event, ...args) => {
    window.dispatchEvent(new CustomEvent(channel, { detail: args[0] }));
  });
}
