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
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ipcBridge } from '@/common';
import { getUserDataDir, scanAndPrepareDataDir, setStoredCustomDataDir } from '@/common/platform';
import { createSkillFileService } from '@process/services/skills';
import { getSystemDir, ProcessEnv } from '@process/utils/initStorage';
import { copyDirectoryRecursively, getConfigPath, getDataPath, resolveCliSafePath } from '@process/utils';

export function initApplicationBridgeCore(): void {
  const skillFiles = createSkillFileService();
  ipcBridge.fs.listSkillFiles.provider(({ skill_location }) => skillFiles.list(skill_location));
  ipcBridge.fs.readSkillFile.provider(({ skill_location, relative_path }) =>
    skillFiles.read(skill_location, relative_path)
  );

  // application.systemInfo is served by the backend via HTTP; updateSystemInfo
  // and getPath below remain buildProvider (true IPC) because they need
  // main-process-only APIs (copyDirectoryRecursively, os.homedir()).
  ipcBridge.application.updateSystemInfo.provider(async ({ dataDir, cacheDir, workDir, logDir }) => {
    const oldDir = getSystemDir();

    if (dataDir && typeof dataDir === 'string' && dataDir.trim() !== '') {
      const safeDataDir = path.resolve(dataDir.trim());
      if (!fs.existsSync(safeDataDir)) {
        await fs.promises.mkdir(safeDataDir, { recursive: true });
      }

      // Check if target directory already contains an AionUi database
      const targetDb = path.join(safeDataDir, 'aionui', 'aionui-backend.db');
      const rootDb = path.join(safeDataDir, 'aionui-backend.db');
      const hasExistingDb =
        (fs.existsSync(targetDb) && fs.statSync(targetDb).size > 0) ||
        (fs.existsSync(rootDb) && fs.statSync(rootDb).size > 0);

      // Scan and prepare the directory (ensures subdirectories exist, checks root db or backups)
      scanAndPrepareDataDir(safeDataDir);

      // If the target directory has NO existing database, copy current data to initialize it without deleting source
      if (!hasExistingDb) {
        const currentData = getDataPath();
        const currentConfig = getConfigPath();
        const safeWork = path.join(safeDataDir, 'aionui');
        const safeConf = path.join(safeDataDir, 'config');
        if (fs.existsSync(currentData) && path.resolve(currentData) !== path.resolve(safeWork)) {
          await copyDirectoryRecursively(currentData, safeWork);
        }
        if (fs.existsSync(currentConfig) && path.resolve(currentConfig) !== path.resolve(safeConf)) {
          await copyDirectoryRecursively(currentConfig, safeConf);
        }
      }

      // Persist the custom data directory setting so Electron uses it on every startup
      setStoredCustomDataDir(safeDataDir);

      const safeWorkDir = path.join(safeDataDir, 'aionui');
      const safeCacheDir = path.join(safeDataDir, 'config');
      const safeLogDir = path.join(safeDataDir, 'logs');

      await ProcessEnv.set('aionui.dir', {
        dataDir: safeDataDir,
        cacheDir: safeCacheDir,
        workDir: safeWorkDir,
        logDir: safeLogDir,
      });
      return;
    }

    const safeCacheDir = resolveCliSafePath(cacheDir || oldDir.cacheDir, getConfigPath());
    const safeWorkDir = resolveCliSafePath(workDir || oldDir.workDir, getDataPath());
    const safeLogDir = logDir ? resolveCliSafePath(logDir, oldDir.logDir) : oldDir.logDir;

    if (oldDir.cacheDir !== safeCacheDir && fs.existsSync(oldDir.cacheDir)) {
      await copyDirectoryRecursively(oldDir.cacheDir, safeCacheDir);
    }
    await ProcessEnv.set('aionui.dir', { cacheDir: safeCacheDir, workDir: safeWorkDir, logDir: safeLogDir });
  });

  ipcBridge.application.backupData.provider(async ({ targetDir }) => {
    const defaultBackupDir = path.join(getUserDataDir(), 'backups');
    const safeTarget = targetDir ? resolveCliSafePath(targetDir, defaultBackupDir) : defaultBackupDir;
    if (!fs.existsSync(safeTarget)) {
      await fs.promises.mkdir(safeTarget, { recursive: true });
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const backupSubdir = path.join(safeTarget, `aionui-backup-${timestamp}`);
    await fs.promises.mkdir(backupSubdir, { recursive: true });

    const dbPath = path.join(getDataPath(), 'aionui-backend.db');
    if (fs.existsSync(dbPath)) {
      await fs.promises.copyFile(dbPath, path.join(backupSubdir, 'aionui-backend.db'));
      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        await fs.promises.copyFile(walPath, path.join(backupSubdir, 'aionui-backend.db-wal'));
      }
      const shmPath = `${dbPath}-shm`;
      if (fs.existsSync(shmPath)) {
        await fs.promises.copyFile(shmPath, path.join(backupSubdir, 'aionui-backend.db-shm'));
      }
    }

    const configDir = getConfigPath();
    if (fs.existsSync(configDir)) {
      await copyDirectoryRecursively(configDir, path.join(backupSubdir, 'config'));
    }

    return { success: true, backupPath: backupSubdir };
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
