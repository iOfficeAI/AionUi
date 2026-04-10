/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Platform-agnostic application bridge handlers.
 * Safe to use in both Electron and standalone server mode.
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
    try {
      // Normalize paths: if the user picked a real path that matches a CLI-safe
      // symlink target (e.g. macOS file picker resolves symlinks), restore the
      // symlink path to avoid storing paths with spaces.
      const safeCacheDir = resolveCliSafePath(cacheDir, getConfigPath());
      const safeWorkDir = resolveCliSafePath(workDir, getDataPath());

      const oldDir = getSystemDir();
      if (oldDir.cacheDir !== safeCacheDir) {
        await copyDirectoryRecursively(oldDir.cacheDir, safeCacheDir);
      }
      await ProcessEnv.set('aionui.dir', { cacheDir: safeCacheDir, workDir: safeWorkDir });
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, msg };
    }
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
