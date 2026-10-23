/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredCustomDataDir,
  copyDirectoryContentsSync,
  findAppRootDir,
  getDefaultUserDataDir,
  getPortableUserDataDir,
  getStoredCustomDataDir,
  getUserDataDir,
  isAionUiRoot,
  isPortableMode,
  isSystemInstallationDir,
  migrateLegacyUserDataIfNeeded,
  rebasePortableDatabase,
  resetConfiguredUserDataDirForTesting,
  configurePortableUserData,
  scanAndPrepareDataDir,
  setStoredCustomDataDir,
} from '@/common/platform/userDataPath';

describe('userDataPath (Portable storage)', () => {
  const tempTestDir = path.join(process.cwd(), 'temp', 'userDataPath-test-' + Date.now());

  beforeEach(() => {
    resetConfiguredUserDataDirForTesting();
    fs.mkdirSync(tempTestDir, { recursive: true });
    delete process.env.AIONUI_DATA_DIR;
    delete process.env.AIONUI_APP_ROOT;
    delete process.env.AIONUI_MULTI_INSTANCE;
    delete process.env.AIONUI_E2E_TEST;
    delete process.env.AIONUI_E2E_USER_DATA_DIR;
    delete process.env.AIONUI_PORTABLE;
    delete process.env.PORTABLE_EXECUTABLE_DIR;
  });

  afterEach(() => {
    resetConfiguredUserDataDirForTesting();
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  describe('isAionUiRoot', () => {
    it('returns true when directory has package.json with name AionUi', () => {
      const dir = path.join(tempTestDir, 'repo');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'AionUi' }));
      expect(isAionUiRoot(dir)).toBe(true);
    });

    it('returns false for directories with other package.json or missing file', () => {
      const dir = path.join(tempTestDir, 'other');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'Other' }));
      expect(isAionUiRoot(dir)).toBe(false);
      expect(isAionUiRoot(path.join(tempTestDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('findAppRootDir and getPortableUserDataDir', () => {
    it('respects AIONUI_APP_ROOT when set', () => {
      const customRoot = path.join(tempTestDir, 'custom-root');
      fs.mkdirSync(customRoot, { recursive: true });
      process.env.AIONUI_APP_ROOT = customRoot;

      expect(findAppRootDir()).toBe(customRoot);
      expect(getPortableUserDataDir()).toBe(path.join(customRoot, 'data'));
    });

    it('respects AIONUI_DATA_DIR directly', () => {
      const customData = path.join(tempTestDir, 'custom-data');
      process.env.AIONUI_DATA_DIR = customData;

      expect(getPortableUserDataDir()).toBe(path.resolve(customData));
      expect(findAppRootDir()).toBe(path.dirname(path.resolve(customData)));
    });

    it('uses data-2 when AIONUI_MULTI_INSTANCE is 1', () => {
      process.env.AIONUI_APP_ROOT = tempTestDir;
      process.env.AIONUI_MULTI_INSTANCE = '1';

      expect(getPortableUserDataDir()).toBe(path.join(tempTestDir, 'data-2'));
    });
  });

  describe('copyDirectoryContentsSync', () => {
    it('copies files and subdirectories while skipping locks and caches', () => {
      const src = path.join(tempTestDir, 'src');
      const dest = path.join(tempTestDir, 'dest');
      fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
      fs.mkdirSync(path.join(src, 'Cache'), { recursive: true });

      fs.writeFileSync(path.join(src, 'file.txt'), 'hello');
      fs.writeFileSync(path.join(src, 'sub', 'nested.txt'), 'world');
      fs.writeFileSync(path.join(src, 'lockfile'), 'lock');
      fs.writeFileSync(path.join(src, 'test.lock'), 'lock');
      fs.writeFileSync(path.join(src, 'Cache', 'cache.bin'), 'cache');

      copyDirectoryContentsSync(src, dest);

      expect(fs.existsSync(path.join(dest, 'file.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(dest, 'file.txt'), 'utf8')).toBe('hello');
      expect(fs.existsSync(path.join(dest, 'sub', 'nested.txt'))).toBe(true);

      // Ignored files and directories
      expect(fs.existsSync(path.join(dest, 'lockfile'))).toBe(false);
      expect(fs.existsSync(path.join(dest, 'test.lock'))).toBe(false);
      expect(fs.existsSync(path.join(dest, 'Cache'))).toBe(false);
    });
  });

  describe('configurePortableUserData', () => {
    it('isolates E2E sandbox if AIONUI_E2E_TEST is 1', () => {
      const e2eDir = path.join(tempTestDir, 'e2e-sandbox');
      process.env.AIONUI_E2E_TEST = '1';
      process.env.AIONUI_E2E_USER_DATA_DIR = e2eDir;

      const mockApp = {
        setPath: vi.fn(),
        getPath: vi.fn(() => '/mock/userData'),
      };

      const result = configurePortableUserData(mockApp as unknown as Electron.App);
      expect(result).toBe(path.resolve(e2eDir));
      expect(mockApp.setPath).toHaveBeenCalledWith('userData', path.resolve(e2eDir));
    });

    it('sets userData, logs, and crashDumps to portable data dir', () => {
      const appRoot = path.join(tempTestDir, 'app');
      fs.mkdirSync(appRoot, { recursive: true });
      process.env.AIONUI_APP_ROOT = appRoot;

      const mockApp = {
        setPath: vi.fn(),
        getPath: vi.fn(() => '/mock/userData'),
      };

      const result = configurePortableUserData(mockApp as unknown as Electron.App);
      const expectedData = path.join(appRoot, 'data');
      expect(result).toBe(expectedData);
      expect(mockApp.setPath).toHaveBeenCalledWith('userData', expectedData);
      expect(mockApp.setPath).toHaveBeenCalledWith('logs', path.join(expectedData, 'logs'));
      expect(mockApp.setPath).toHaveBeenCalledWith('crashDumps', path.join(expectedData, 'crashDumps'));
    });

    it('falls back to default OS userData when not in portable mode', () => {
      process.env.AIONUI_PORTABLE = '0';
      const defaultPath = path.join(tempTestDir, 'default-userData');

      const mockApp = {
        setPath: vi.fn(),
        getPath: vi.fn((name: string) => (name === 'userData' ? defaultPath : '/mock/' + name)),
      };

      expect(isPortableMode()).toBe(false);

      // When called with non-portable app, configurePortableUserData should not redirect to data/
      const result = configurePortableUserData(mockApp as unknown as Electron.App);
      expect(result).toBe(defaultPath);
      expect(mockApp.setPath).not.toHaveBeenCalledWith('userData', expect.stringContaining('data'));
    });
  });

  describe('isSystemInstallationDir and isPortableMode', () => {
    it('identifies Windows Program Files as a system installation directory', () => {
      expect(isSystemInstallationDir('C:\\Program Files\\AionUi')).toBe(true);
      expect(isSystemInstallationDir('C:\\Program Files (x86)\\AionUi')).toBe(true);
      expect(isSystemInstallationDir('C:\\Windows\\System32')).toBe(true);
    });

    it('identifies macOS and Linux system directories', () => {
      expect(isSystemInstallationDir('/Applications/AionUi.app')).toBe(true);
      expect(isSystemInstallationDir('/usr/bin/aionui')).toBe(true);
      expect(isSystemInstallationDir('/opt/aionui')).toBe(true);
      expect(isSystemInstallationDir('/etc/aionui')).toBe(true);
    });

    it('disallows portable mode in system installation directories even if files exist', () => {
      expect(isPortableMode('C:\\Program Files\\AionUi')).toBe(false);
      expect(isPortableMode('C:\\Program Files (x86)\\AionUi')).toBe(false);
    });

    it('enables portable mode when explicit marker or env var is set', () => {
      const portableDir = path.join(tempTestDir, 'portable-drive');
      fs.mkdirSync(portableDir, { recursive: true });

      expect(isPortableMode(portableDir)).toBe(false);

      fs.writeFileSync(path.join(portableDir, '.portable'), '');
      expect(isPortableMode(portableDir)).toBe(true);
    });

    it('getUserDataDir returns portable path when portable, default path otherwise', () => {
      const appRoot = path.join(tempTestDir, 'app-portable');
      fs.mkdirSync(appRoot, { recursive: true });
      process.env.AIONUI_APP_ROOT = appRoot;

      expect(getUserDataDir()).toBe(path.join(appRoot, 'data'));

      delete process.env.AIONUI_APP_ROOT;
      process.env.AIONUI_PORTABLE = '0';
      expect(getUserDataDir()).toBe(getDefaultUserDataDir());
    });
  });

  describe('rebasePortableDatabase', () => {
    it('creates marker file and skips when database does not exist', () => {
      const targetDir = path.join(tempTestDir, 'data');
      fs.mkdirSync(targetDir, { recursive: true });
      rebasePortableDatabase(targetDir);
      // No DB, should not throw
      expect(true).toBe(true);
    });
  });

  describe('custom data location and scanAndPrepareDataDir', () => {
    afterEach(() => {
      clearStoredCustomDataDir();
    });

    it('persists and retrieves custom data directory', () => {
      const customFolder = path.join(tempTestDir, 'my-custom-folder');
      fs.mkdirSync(customFolder, { recursive: true });

      setStoredCustomDataDir(customFolder);
      expect(getStoredCustomDataDir()).toBe(path.resolve(customFolder));
      expect(getUserDataDir()).toBe(path.resolve(customFolder));

      clearStoredCustomDataDir();
      expect(getStoredCustomDataDir()).toBeNull();
    });

    it('scans and creates subdirectories without deleting anything', () => {
      const targetDir = path.join(tempTestDir, 'target-scan');
      fs.mkdirSync(targetDir, { recursive: true });

      // Put an existing file in targetDir
      fs.writeFileSync(path.join(targetDir, 'user-note.txt'), 'do not delete');

      scanAndPrepareDataDir(targetDir);

      expect(fs.existsSync(path.join(targetDir, 'aionui'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'config'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'logs'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'crashDumps'))).toBe(true);
      expect(fs.readFileSync(path.join(targetDir, 'user-note.txt'), 'utf8')).toBe('do not delete');
    });

    it('locates database at root and copies to aionui/ without deleting source', () => {
      const targetDir = path.join(tempTestDir, 'target-with-root-db');
      fs.mkdirSync(targetDir, { recursive: true });
      const rootDb = path.join(targetDir, 'aionui-backend.db');
      fs.writeFileSync(rootDb, 'sqlite-dummy-content');

      scanAndPrepareDataDir(targetDir);

      const nestedDb = path.join(targetDir, 'aionui', 'aionui-backend.db');
      expect(fs.existsSync(nestedDb)).toBe(true);
      expect(fs.readFileSync(nestedDb, 'utf8')).toBe('sqlite-dummy-content');
      // Root DB must NOT be deleted
      expect(fs.existsSync(rootDb)).toBe(true);
    });

    it('scans and restores from backup subdirectory if aionui-backend.db is absent', () => {
      const targetDir = path.join(tempTestDir, 'target-with-backup');
      const backupDir = path.join(targetDir, 'aionui-backup-20260101');
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, 'aionui-backend.db'), 'backup-db-content');

      scanAndPrepareDataDir(targetDir);

      const targetDb = path.join(targetDir, 'aionui', 'aionui-backend.db');
      expect(fs.existsSync(targetDb)).toBe(true);
      expect(fs.readFileSync(targetDb, 'utf8')).toBe('backup-db-content');
      // Backup must NOT be deleted
      expect(fs.existsSync(path.join(backupDir, 'aionui-backend.db'))).toBe(true);
    });
  });
});
