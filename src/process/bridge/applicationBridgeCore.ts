/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Platform-agnostic application bridge handlers.
 * Safe to use in both Electron and WebUI server mode.
 * Electron-only handlers (restart, devtools, zoom, CDP) remain in applicationBridge.ts.
 */
import os from 'os';
import path from 'path';
import { ipcBridge } from '@/common';
import { getSystemDir, ProcessEnv } from '@process/utils/initStorage';
import { copyDirectoryRecursively, getConfigPath, getDataPath, resolveCliSafePath } from '@process/utils';

export function initApplicationBridgeCore(): void {
  ipcBridge.application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });

  ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
    const safeCacheDir = resolveCliSafePath(cacheDir, getConfigPath());
    const safeWorkDir = resolveCliSafePath(workDir, getDataPath());

    const oldDir = getSystemDir();
    if (oldDir.cacheDir !== safeCacheDir) {
      await copyDirectoryRecursively(oldDir.cacheDir, safeCacheDir);
    }
    await ProcessEnv.set('aionui.dir', { cacheDir: safeCacheDir, workDir: safeWorkDir });
  });

  ipcBridge.application.getPath.provider(({ name }) => {
    // Resolve common paths without Electron
    const home = os.homedir();
    const map: Record<string, string> = {
      home,
      desktop: path.join(home, 'Desktop'),
      downloads: path.join(home, 'Downloads'),
    };
    return Promise.resolve(map[name] ?? home);
  });
}
