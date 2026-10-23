/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

let configuredUserDataDir: string | null = null;

const PORTABLE_MARKER_FILE = 'portable-location.json';
export const DATA_LOCATION_FILE = 'data-location.json';

type PortableMarker = {
  lastDataDir: string;
};

/**
 * Reads any user-configured custom data directory from data-location.json.
 * Checks both the application root folder and the standard OS user data folder.
 */
export function getStoredCustomDataDir(): string | null {
  // Check 1: In application root directory
  try {
    const rootDir = findAppRootDir();
    const locFile = path.join(rootDir, DATA_LOCATION_FILE);
    if (fs.existsSync(locFile)) {
      const parsed = JSON.parse(fs.readFileSync(locFile, 'utf8')) as { dataDir?: string };
      if (parsed?.dataDir && typeof parsed.dataDir === 'string' && parsed.dataDir.trim() !== '') {
        const resolved = path.resolve(parsed.dataDir.trim());
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      }
    }
  } catch {
    // ignore
  }

  // Check 2: In standard OS user data directory
  try {
    const defaultData = getDefaultUserDataDir();
    const locFile = path.join(defaultData, DATA_LOCATION_FILE);
    if (fs.existsSync(locFile)) {
      const parsed = JSON.parse(fs.readFileSync(locFile, 'utf8')) as { dataDir?: string };
      if (parsed?.dataDir && typeof parsed.dataDir === 'string' && parsed.dataDir.trim() !== '') {
        const resolved = path.resolve(parsed.dataDir.trim());
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Persists a user-selected custom data directory to data-location.json in both
 * the application root folder and the standard OS user data folder.
 */
export function setStoredCustomDataDir(targetDir: string): void {
  const norm = path.resolve(targetDir);
  const data = JSON.stringify({ dataDir: norm, updatedAt: new Date().toISOString() }, null, 2);

  // Write to app root directory if accessible
  try {
    const rootDir = findAppRootDir();
    fs.writeFileSync(path.join(rootDir, DATA_LOCATION_FILE), data, 'utf8');
  } catch (err) {
    console.warn('[AionUi] Failed to write data-location.json in app root:', err);
  }

  // Write to standard OS user data directory
  try {
    const defaultData = getDefaultUserDataDir();
    if (!fs.existsSync(defaultData)) {
      fs.mkdirSync(defaultData, { recursive: true });
    }
    fs.writeFileSync(path.join(defaultData, DATA_LOCATION_FILE), data, 'utf8');
  } catch (err) {
    console.warn('[AionUi] Failed to write data-location.json in default user data:', err);
  }
}

/**
 * Clears the stored custom data directory pointer (used in testing).
 */
export function clearStoredCustomDataDir(): void {
  try {
    const rootDir = findAppRootDir();
    const rootFile = path.join(rootDir, DATA_LOCATION_FILE);
    if (fs.existsSync(rootFile)) fs.unlinkSync(rootFile);
  } catch {
    // ignore
  }

  try {
    const defaultData = getDefaultUserDataDir();
    const defaultFile = path.join(defaultData, DATA_LOCATION_FILE);
    if (fs.existsSync(defaultFile)) fs.unlinkSync(defaultFile);
  } catch {
    // ignore
  }
}

/**
 * Checks whether a given directory is located in a system-protected installation directory
 * (e.g. C:\Program Files, /Applications, /usr) where mutable user data must not be written.
 */
export function isSystemInstallationDir(dir: string): boolean {
  if (!dir) return false;
  const norm = path.resolve(dir).toLowerCase();

  if (process.platform === 'win32') {
    const systemDirs = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.ProgramW6432,
      process.env.SystemRoot,
      process.env.windir,
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\Windows',
    ].filter(Boolean) as string[];

    for (const sysDir of systemDirs) {
      const normSys = path.resolve(sysDir).toLowerCase();
      if (norm === normSys || norm.startsWith(normSys + path.sep)) {
        return true;
      }
    }
  } else if (process.platform === 'darwin') {
    const normSys = ['/applications', '/system', '/library'];
    for (const sysDir of normSys) {
      if (norm === sysDir || norm.startsWith(sysDir + '/')) {
        return true;
      }
    }
  } else {
    // Linux and other Unix
    const normSys = ['/usr', '/opt', '/var', '/etc'];
    for (const sysDir of normSys) {
      if (norm === sysDir || norm.startsWith(sysDir + '/')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determines whether the application should run in portable storage mode.
 * In portable mode, data is stored in the application folder rather than the OS-standard %APPDATA% directory.
 */
export function isPortableMode(appRoot?: string): boolean {
  // 1. Explicit environment variable overrides
  if (process.env.AIONUI_PORTABLE === '1' || process.env.AIONUI_PORTABLE === 'true') {
    return true;
  }
  if (process.env.AIONUI_PORTABLE === '0' || process.env.AIONUI_PORTABLE === 'false') {
    return false;
  }
  if (process.env.AIONUI_DATA_DIR && process.env.AIONUI_DATA_DIR.trim() !== '') {
    return true;
  }
  if (process.env.AIONUI_APP_ROOT && process.env.AIONUI_APP_ROOT.trim() !== '') {
    return true;
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR && process.env.PORTABLE_EXECUTABLE_DIR.trim() !== '') {
    return true;
  }

  const root = appRoot || findAppRootDir();

  // 2. System installation directories are NEVER portable
  if (isSystemInstallationDir(root)) {
    return false;
  }

  // 3. Explicit portable marker file next to executable or in app root
  if (fs.existsSync(path.join(root, '.portable')) || fs.existsSync(path.join(root, 'portable'))) {
    return true;
  }

  // 4. In development mode (inside git repo root with AionUi package.json)
  if (isAionUiRoot(root)) {
    return true;
  }

  return false;
}

/**
 * Get OS standard user data directory path when portable mode is not active.
 */
export function getDefaultUserDataDir(): string {
  const isMultiInstance = process.env.AIONUI_MULTI_INSTANCE === '1';
  const appName = isMultiInstance ? 'AionUi-2' : 'AionUi';
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, appName);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, appName);
}

/**
 * Checks whether a given directory is the root of the AionUi project repository.
 */
export function isAionUiRoot(dir: string): boolean {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
      return data.name === 'AionUi';
    }
  } catch {
    // Ignore error
  }
  return false;
}

/**
 * Find the application root directory (e.g. C:\AIonUI or the pendrive folder).
 */
export function findAppRootDir(): string {
  // 1. Explicit environment override
  if (process.env.AIONUI_APP_ROOT && process.env.AIONUI_APP_ROOT.trim() !== '') {
    return path.resolve(process.env.AIONUI_APP_ROOT.trim());
  }

  // 2. Data dir environment override parent
  if (process.env.AIONUI_DATA_DIR && process.env.AIONUI_DATA_DIR.trim() !== '') {
    return path.dirname(path.resolve(process.env.AIONUI_DATA_DIR.trim()));
  }

  // 3. Electron-builder portable executable directory
  if (process.env.PORTABLE_EXECUTABLE_DIR && process.env.PORTABLE_EXECUTABLE_DIR.trim() !== '') {
    return path.resolve(process.env.PORTABLE_EXECUTABLE_DIR.trim());
  }

  // 4. Packaged app: directory containing executable
  if (process.versions?.electron && process.execPath) {
    const isPackaged = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      ? fs.existsSync((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!)
      : false;
    if (isPackaged) {
      if (process.platform === 'darwin') {
        const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!;
        return path.resolve(resourcesPath, '../../..');
      }
      return path.dirname(process.execPath);
    }
  }

  // 5. Dev mode: check current working directory
  const cwd = process.cwd();
  if (isAionUiRoot(cwd)) {
    return cwd;
  }

  // 6. Walk up from __dirname
  let candidate = __dirname;
  for (let i = 0; i < 7; i++) {
    if (isAionUiRoot(candidate)) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }

  return cwd;
}

/**
 * Get the portable user data directory path inside the application folder.
 */
export function getPortableUserDataDir(): string {
  if (process.env.AIONUI_DATA_DIR && process.env.AIONUI_DATA_DIR.trim() !== '') {
    return path.resolve(process.env.AIONUI_DATA_DIR.trim());
  }
  const rootDir = findAppRootDir();
  const subDir = process.env.AIONUI_MULTI_INSTANCE === '1' ? 'data-2' : 'data';
  return path.join(rootDir, subDir);
}

/**
 * Get active user data directory based on portable detection.
 */
export function getUserDataDir(): string {
  if (configuredUserDataDir) {
    return configuredUserDataDir;
  }
  if (process.env.AIONUI_DATA_DIR && process.env.AIONUI_DATA_DIR.trim() !== '') {
    return path.resolve(process.env.AIONUI_DATA_DIR.trim());
  }
  const custom = getStoredCustomDataDir();
  if (custom) {
    return custom;
  }
  if (isPortableMode()) {
    return getPortableUserDataDir();
  }
  return getDefaultUserDataDir();
}

/**
 * Recursively copies directory contents while skipping locks and ephemeral Chromium caches.
 */
export function copyDirectoryContentsSync(src: string, dest: string): void {
  const IGNORED_NAMES = new Set([
    'lockfile',
    'SingletonLock',
    'SingletonCookie',
    'SingletonSocket',
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'Service Worker',
    'blob_storage',
    'Session Storage',
    'Shared Dictionary',
    'Network',
  ]);

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (
      IGNORED_NAMES.has(entry.name) ||
      entry.name.endsWith('.lock') ||
      entry.name.includes('_backup_') ||
      entry.name === 'logs'
    ) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    try {
      if (entry.isSymbolicLink()) {
        try {
          const linkTarget = fs.readlinkSync(srcPath);
          if (fs.existsSync(destPath)) {
            fs.rmSync(destPath, { recursive: true, force: true });
          }
          fs.symlinkSync(linkTarget, destPath, 'junction');
        } catch {
          // Ignore link copying failure
        }
      } else if (entry.isDirectory()) {
        copyDirectoryContentsSync(srcPath, destPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    } catch (err) {
      console.warn(`[AionUi:Portable] Warning: Could not copy ${srcPath}:`, (err as Error).message);
    }
  }
}

function isDbEmptyOrFresh(dbPath: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    try {
      const teamRow = db.prepare('SELECT count(*) as c FROM teams').get() as { c?: number } | undefined;
      const convRow = db.prepare('SELECT count(*) as c FROM conversations').get() as { c?: number } | undefined;
      return (teamRow?.c ?? 0) === 0 && (convRow?.c ?? 0) === 0;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

/**
 * Searches common OS user data locations for pre-existing AionUi data to migrate.
 */
export function migrateLegacyUserDataIfNeeded(
  app: { getPath?: (name: 'userData') => string },
  targetDataDir: string
): void {
  const targetDb = path.join(targetDataDir, 'aionui', 'aionui-backend.db');
  const targetStat = fs.existsSync(targetDb) ? fs.statSync(targetDb) : null;

  const candidates: string[] = [];
  try {
    if (typeof app.getPath === 'function') {
      const defaultUserData = app.getPath('userData');
      const parentDir = path.dirname(defaultUserData);
      candidates.push(path.join(parentDir, 'AionUi-Dev'));
      candidates.push(path.join(parentDir, 'AionUi'));
      if (!candidates.includes(defaultUserData)) {
        candidates.push(defaultUserData);
      }
    }
  } catch {
    // Ignore error
  }

  if (process.platform === 'win32' && process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'AionUi-Dev'));
    candidates.push(path.join(process.env.APPDATA, 'AionUi'));
  }

  let sourceDir: string | null = null;
  let sourceDbStat: fs.Stats | null = null;
  for (const c of candidates) {
    if (path.resolve(c) === path.resolve(targetDataDir)) continue;
    const dbCandidate = path.join(c, 'aionui', 'aionui-backend.db');
    if (fs.existsSync(dbCandidate)) {
      const stat = fs.statSync(dbCandidate);
      if (!sourceDir || (sourceDbStat && stat.size > sourceDbStat.size)) {
        sourceDir = c;
        sourceDbStat = stat;
      }
    }
  }

  if (!sourceDir || !sourceDbStat) return;

  if (targetStat) {
    const targetIsEmpty = isDbEmptyOrFresh(targetDb);
    if (!targetIsEmpty) {
      // Target directory already contains valid user data — NEVER overwrite or delete existing data
      return;
    }
    console.log(
      `[AionUi:Portable] Target database is empty. Migrating existing user data from ${sourceDir} to ${targetDataDir}...`
    );
  }

  console.log(`[AionUi:Portable] Migrating existing user data from ${sourceDir} to ${targetDataDir}...`);
  try {
    // Only copy relevant AionUi data: the database directory, config, and auth/settings files
    const ESSENTIAL_ITEMS = ['aionui', 'config', 'auth.enc', 'analytics.json', 'gpu.config.json'];
    for (const item of ESSENTIAL_ITEMS) {
      const srcItem = path.join(sourceDir, item);
      const destItem = path.join(targetDataDir, item);
      if (!fs.existsSync(srcItem)) continue;
      if (fs.statSync(srcItem).isDirectory()) {
        copyDirectoryContentsSync(srcItem, destItem);
      } else {
        fs.copyFileSync(srcItem, destItem);
      }
    }
    console.log(`[AionUi:Portable] Migration complete.`);
  } catch (err) {
    console.error(`[AionUi:Portable] Error during user data migration:`, err);
  }
}

/**
 * Detect legacy directory embedded in SQLite DB if no marker exists.
 */
function detectLegacyDirFromDb(dbPath: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db
        .prepare("SELECT resource_uri FROM folders WHERE resource_uri LIKE 'file:///%aionui/conversations%' LIMIT 1")
        .get() as { resource_uri?: string } | undefined;
      if (row?.resource_uri) {
        const match = row.resource_uri.match(/^file:\/\/\/(.+?)\/conversations/i);
        if (match && match[1]) {
          return path.normalize(decodeURIComponent(match[1]));
        }
      }
    } finally {
      db.close();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Rebases stored paths in SQLite database when the folder or drive letter has moved.
 */
export function rebasePortableDatabase(targetDataDir: string): void {
  const markerPath = path.join(targetDataDir, PORTABLE_MARKER_FILE);
  const currentAionuiDir = path.join(targetDataDir, 'aionui');
  const dbPath = path.join(currentAionuiDir, 'aionui-backend.db');

  if (!fs.existsSync(dbPath)) return;

  let lastDataDir: string | null = null;
  if (fs.existsSync(markerPath)) {
    try {
      const content = fs.readFileSync(markerPath, 'utf8');
      const parsed = JSON.parse(content) as PortableMarker;
      lastDataDir = parsed.lastDataDir;
    } catch {
      // ignore
    }
  }

  if (!lastDataDir) {
    lastDataDir = detectLegacyDirFromDb(dbPath);
  }

  if (lastDataDir && path.resolve(lastDataDir) !== path.resolve(currentAionuiDir)) {
    console.log(`[AionUi:Portable] Rebasing database paths from "${lastDataDir}" to "${currentAionuiDir}"...`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3');
      const db = new Database(dbPath);
      try {
        const oldNorm = path.normalize(lastDataDir);
        const newNorm = path.normalize(currentAionuiDir);

        const oldUriPart = oldNorm.replace(/\\/g, '/');
        const newUriPart = newNorm.replace(/\\/g, '/');

        db.prepare('UPDATE folders SET resource_uri = replace(resource_uri, ?, ?) WHERE resource_uri LIKE ?').run(
          oldUriPart,
          newUriPart,
          `%${oldUriPart}%`
        );

        const oldEscaped = oldNorm.replace(/\\/g, '\\\\');
        const newEscaped = newNorm.replace(/\\/g, '\\\\');

        db.prepare('UPDATE conversations SET extra = replace(extra, ?, ?) WHERE extra LIKE ?').run(
          oldEscaped,
          newEscaped,
          `%${oldEscaped}%`
        );

        db.prepare('UPDATE conversations SET extra = replace(extra, ?, ?) WHERE extra LIKE ?').run(
          oldUriPart,
          newUriPart,
          `%${oldUriPart}%`
        );

        db.prepare('UPDATE skills SET path = replace(path, ?, ?) WHERE path LIKE ?').run(
          oldNorm,
          newNorm,
          `%${oldNorm}%`
        );

        console.log(`[AionUi:Portable] Database paths rebased successfully.`);
      } finally {
        db.close();
      }
    } catch (err) {
      console.warn(`[AionUi:Portable] Warning: Database rebase error:`, (err as Error).message);
    }
  }

  try {
    const markerData: PortableMarker = { lastDataDir: currentAionuiDir };
    fs.writeFileSync(markerPath, JSON.stringify(markerData, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

/**
 * Scans the selected data directory on startup, ensures all necessary structure exists,
 * locates or restores existing database/configs if needed, and never deletes existing data.
 */
export function scanAndPrepareDataDir(targetDataDir: string): void {
  if (!fs.existsSync(targetDataDir)) {
    try {
      fs.mkdirSync(targetDataDir, { recursive: true });
    } catch (err) {
      console.warn(`[AionUi] Failed to create data directory ${targetDataDir}:`, err);
      return;
    }
  }

  const aionuiDir = path.join(targetDataDir, 'aionui');
  const configDir = path.join(targetDataDir, 'config');
  const logsDir = path.join(targetDataDir, 'logs');
  const crashDir = path.join(targetDataDir, 'crashDumps');

  try {
    if (!fs.existsSync(aionuiDir)) fs.mkdirSync(aionuiDir, { recursive: true });
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    if (!fs.existsSync(crashDir)) fs.mkdirSync(crashDir, { recursive: true });
  } catch (err) {
    console.warn(`[AionUi] Failed to ensure subdirectories in ${targetDataDir}:`, err);
  }

  const targetDb = path.join(aionuiDir, 'aionui-backend.db');
  const hasValidTargetDb = fs.existsSync(targetDb) && fs.statSync(targetDb).size > 0;

  if (!hasValidTargetDb) {
    // 1. Check if aionui-backend.db exists at root of targetDataDir (e.g. if user placed DB directly in folder)
    const rootDb = path.join(targetDataDir, 'aionui-backend.db');
    if (fs.existsSync(rootDb) && fs.statSync(rootDb).size > 0) {
      console.log(
        `[AionUi] Found database at root of ${targetDataDir}, copying to ${targetDb} without deleting source...`
      );
      try {
        fs.copyFileSync(rootDb, targetDb);
        const rootWal = `${rootDb}-wal`;
        if (fs.existsSync(rootWal)) fs.copyFileSync(rootWal, `${targetDb}-wal`);
        const rootShm = `${rootDb}-shm`;
        if (fs.existsSync(rootShm)) fs.copyFileSync(rootShm, `${targetDb}-shm`);
      } catch (err) {
        console.warn(`[AionUi] Failed to copy root DB to aionui/:`, err);
      }
    } else {
      // 2. Scan for backup subdirectories inside targetDataDir
      try {
        const entries = fs.readdirSync(targetDataDir, { withFileTypes: true });
        let newestBackupDir: string | null = null;
        let newestBackupTime = 0;

        for (const entry of entries) {
          if (entry.isDirectory() && /^(aionui|data)[-_]backup/i.test(entry.name)) {
            const backupPath = path.join(targetDataDir, entry.name);
            const backupDb = path.join(backupPath, 'aionui-backend.db');
            if (fs.existsSync(backupDb) && fs.statSync(backupDb).size > 0) {
              const mtime = fs.statSync(backupDb).mtimeMs;
              if (mtime > newestBackupTime) {
                newestBackupTime = mtime;
                newestBackupDir = backupPath;
              }
            }
          }
        }

        if (newestBackupDir) {
          console.log(`[AionUi] Restoring database from backup ${newestBackupDir} without deleting anything...`);
          const backupDb = path.join(newestBackupDir, 'aionui-backend.db');
          fs.copyFileSync(backupDb, targetDb);
          const backupWal = `${backupDb}-wal`;
          if (fs.existsSync(backupWal)) fs.copyFileSync(backupWal, `${targetDb}-wal`);
          const backupShm = `${backupDb}-shm`;
          if (fs.existsSync(backupShm)) fs.copyFileSync(backupShm, `${targetDb}-shm`);

          const backupConfig = path.join(newestBackupDir, 'config');
          if (fs.existsSync(backupConfig)) {
            copyDirectoryContentsSync(backupConfig, configDir);
          }
        }
      } catch (err) {
        console.warn(`[AionUi] Error while scanning for backup folders:`, err);
      }
    }
  }

  // Ensure portable-location.json is up to date
  try {
    const markerPath = path.join(targetDataDir, PORTABLE_MARKER_FILE);
    const markerData: PortableMarker = { lastDataDir: aionuiDir };
    fs.writeFileSync(markerPath, JSON.stringify(markerData, null, 2), 'utf8');
  } catch {
    // ignore
  }

  // Rebase stored paths in SQLite database if location moved or drive letter changed
  try {
    rebasePortableDatabase(targetDataDir);
  } catch (err) {
    console.warn(`[AionUi] Rebase database error:`, err);
  }
}

/**
 * Configure Electron app to store all data into the application folder itself when in portable mode,
 * or use the standard OS-level userData directory when installed normally.
 */
export function configurePortableUserData(app: Electron.App): string {
  if (configuredUserDataDir) {
    return configuredUserDataDir;
  }

  // E2E test isolation: keep tests on their isolated sandbox
  const e2eDir = process.env.AIONUI_E2E_TEST === '1' ? process.env.AIONUI_E2E_USER_DATA_DIR : undefined;
  if (e2eDir && e2eDir.trim() !== '') {
    const resolvedE2e = path.resolve(e2eDir.trim());
    try {
      fs.mkdirSync(resolvedE2e, { recursive: true });
      scanAndPrepareDataDir(resolvedE2e);
      app.setPath('userData', resolvedE2e);
      configuredUserDataDir = resolvedE2e;
      return resolvedE2e;
    } catch (err) {
      console.warn(`[AionUi] Failed to create E2E userData directory ${resolvedE2e}:`, err);
    }
  }

  const customDir = getStoredCustomDataDir();
  const hasEnvDir = Boolean(process.env.AIONUI_DATA_DIR && process.env.AIONUI_DATA_DIR.trim() !== '');
  const portable = isPortableMode();

  // If NOT in portable mode and no custom directory configured, use standard OS userData
  if (!portable && !customDir && !hasEnvDir) {
    try {
      const defaultUserData = app.getPath('userData');
      fs.mkdirSync(defaultUserData, { recursive: true });
      scanAndPrepareDataDir(defaultUserData);
      configuredUserDataDir = defaultUserData;
      return defaultUserData;
    } catch {
      const fallback = getDefaultUserDataDir();
      try {
        fs.mkdirSync(fallback, { recursive: true });
        app.setPath('userData', fallback);
      } catch {
        // ignore
      }
      scanAndPrepareDataDir(fallback);
      configuredUserDataDir = fallback;
      return fallback;
    }
  }

  const targetDataDir = getUserDataDir();
  try {
    fs.mkdirSync(targetDataDir, { recursive: true });
  } catch (err) {
    console.warn(`[AionUi:Portable] Failed to create portable user data directory at ${targetDataDir}:`, err);
    // Graceful fallback to standard OS userData
    try {
      const defaultUserData = app.getPath('userData');
      fs.mkdirSync(defaultUserData, { recursive: true });
      configuredUserDataDir = defaultUserData;
      return defaultUserData;
    } catch {
      const fallback = getDefaultUserDataDir();
      configuredUserDataDir = fallback;
      return fallback;
    }
  }

  // First scan the folder to find/restore database and configs without deleting anything
  scanAndPrepareDataDir(targetDataDir);

  if (!process.env.VITEST && !customDir) {
    migrateLegacyUserDataIfNeeded(app, targetDataDir);
  }

  app.setPath('userData', targetDataDir);

  const logsDir = path.join(targetDataDir, 'logs');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    app.setPath('logs', logsDir);
  } catch {
    // ignore
  }

  try {
    const crashDir = path.join(targetDataDir, 'crashDumps');
    fs.mkdirSync(crashDir, { recursive: true });
    app.setPath('crashDumps', crashDir);
  } catch {
    // ignore
  }

  configuredUserDataDir = targetDataDir;
  return targetDataDir;
}

/**
 * Reset cached configured user data dir (used in tests).
 */
export function resetConfiguredUserDataDirForTesting(): void {
  configuredUserDataDir = null;
}
