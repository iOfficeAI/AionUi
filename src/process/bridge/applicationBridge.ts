/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { ipcBridge } from '../../common';
import { ConfigStorage } from '../../common/storage';
import { getSystemDir, ProcessEnv } from '../initStorage';
import { copyDirectoryRecursively } from '../utils';
import WorkerManage from '../WorkerManage';
import { getZoomFactor, setZoomFactor } from '../utils/zoom';
import { applyStartupSettingsToSystem, getLinuxAutostartEnabled, type StartupSettings } from '../utils/autoStart';
import { setCloseToTray } from '../runtime/appRuntimeSettings';

export function initApplicationBridge(): void {
  ipcBridge.application.restart.provider(() => {
    // 清理所有工作进程
    WorkerManage.clear();
    // 重启应用 - 使用标准的 Electron 重启方式
    app.relaunch();
    app.exit(0);
    return Promise.resolve();
  });

  ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
    try {
      const oldDir = getSystemDir();
      if (oldDir.cacheDir !== cacheDir) {
        await copyDirectoryRecursively(oldDir.cacheDir, cacheDir);
      }
      await ProcessEnv.set('aionui.dir', { cacheDir, workDir });
      return { success: true };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });

  ipcBridge.application.openDevTools.provider(() => {
    // This will be handled by the main window when needed
    return Promise.resolve();
  });

  ipcBridge.application.getZoomFactor.provider(() => Promise.resolve(getZoomFactor()));

  ipcBridge.application.setZoomFactor.provider(({ factor }) => {
    return Promise.resolve(setZoomFactor(factor));
  });

  ipcBridge.application.getStartupSettings.provider(async () => {
    const startOnBoot = (await ConfigStorage.get('app.startOnBoot').catch(() => false)) === true;
    const openWebUiOnBoot = (await ConfigStorage.get('app.openWebUiOnBoot').catch(() => false)) === true;
    const silentOnBoot = (await ConfigStorage.get('app.silentOnBoot').catch(() => false)) === true;
    const closeToTray = (await ConfigStorage.get('app.closeToTray').catch(() => true)) !== false;

    // Provide a best-effort view of what the OS currently has registered.
    let effectiveStartOnBoot: boolean | undefined;
    if (process.platform === 'linux') {
      effectiveStartOnBoot = getLinuxAutostartEnabled();
    } else {
      effectiveStartOnBoot = app.getLoginItemSettings().openAtLogin;
    }

    return { startOnBoot, openWebUiOnBoot, silentOnBoot, closeToTray, effectiveStartOnBoot };
  });

  ipcBridge.application.setStartupSettings.provider(async ({ startOnBoot, openWebUiOnBoot, silentOnBoot, closeToTray }) => {
    try {
      const normalized: StartupSettings = {
        startOnBoot: startOnBoot === true,
        openWebUiOnBoot: openWebUiOnBoot === true,
        silentOnBoot: silentOnBoot === true,
        closeToTray: closeToTray !== false,
      };

      await ConfigStorage.set('app.startOnBoot', normalized.startOnBoot);
      await ConfigStorage.set('app.openWebUiOnBoot', normalized.openWebUiOnBoot);
      await ConfigStorage.set('app.silentOnBoot', normalized.silentOnBoot);
      await ConfigStorage.set('app.closeToTray', normalized.closeToTray);

      // Apply runtime behavior immediately.
      setCloseToTray(normalized.closeToTray);

      await applyStartupSettingsToSystem(normalized);

      let effectiveStartOnBoot: boolean | undefined;
      if (process.platform === 'linux') {
        effectiveStartOnBoot = getLinuxAutostartEnabled();
      } else {
        effectiveStartOnBoot = app.getLoginItemSettings().openAtLogin;
      }

      return { success: true, data: { ...normalized, effectiveStartOnBoot } };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });
}
