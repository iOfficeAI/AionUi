/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { ProcessConfig } from '@process/utils/initStorage';
import { getZoomFactor, setZoomFactor } from '@process/utils/zoom';
import { getCdpStatus, updateCdpConfig } from '@process/utils/configureChromium';
import { initApplicationBridgeCore } from './applicationBridgeCore';

let mainWindowRef: BrowserWindow | null = null;

export function setApplicationMainWindow(win: BrowserWindow): void {
  mainWindowRef = win;
}

export function initApplicationBridge(workerTaskManager: IWorkerTaskManager): void {
  // Platform-agnostic handlers: systemInfo, updateSystemInfo, getPath
  initApplicationBridgeCore();

  ipcBridge.application.restart.provider(() => {
    // 清理所有工作进程
    workerTaskManager.clear();
    // 重启应用 - 使用标准的 Electron 重启方式
    app.relaunch();
    app.exit(0);
    return Promise.resolve();
  });

  ipcBridge.application.isDevToolsOpened.provider(() => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      return Promise.resolve(mainWindowRef.webContents.isDevToolsOpened());
    }
    return Promise.resolve(false);
  });

  ipcBridge.application.openDevTools.provider(() => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      const win = mainWindowRef;
      const wasOpen = win.webContents.isDevToolsOpened();

      if (wasOpen) {
        win.webContents.closeDevTools();
        return Promise.resolve(false);
      } else {
        return new Promise((resolve) => {
          const onOpened = () => {
            win.webContents.off('devtools-opened', onOpened);
            resolve(true);
          };

          win.webContents.once('devtools-opened', onOpened);
          win.webContents.openDevTools();

          setTimeout(() => {
            win.webContents.off('devtools-opened', onOpened);
            if (win.isDestroyed()) {
              resolve(false);
              return;
            }
            resolve(win.webContents.isDevToolsOpened());
          }, 500);
        });
      }
    }
    return Promise.resolve(false);
  });

  ipcBridge.application.getZoomFactor.provider(() => Promise.resolve(getZoomFactor()));

  ipcBridge.application.setZoomFactor.provider(async ({ factor }) => {
    const updatedFactor = setZoomFactor(factor);
    try {
      await ProcessConfig.set('ui.zoomFactor', updatedFactor);
    } catch (error) {
      console.error('[ApplicationBridge] Failed to persist zoom factor:', error);
    }
    return updatedFactor;
  });

  // CDP status and configuration
  ipcBridge.application.getCdpStatus.provider(async () => {
    try {
      const status = getCdpStatus();
      // If port is set, CDP is considered enabled (verification is optional)
      return { success: true, data: status };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.updateCdpConfig.provider(async (config) => {
    try {
      const updatedConfig = updateCdpConfig(config);
      return { success: true, data: updatedConfig };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });
}
