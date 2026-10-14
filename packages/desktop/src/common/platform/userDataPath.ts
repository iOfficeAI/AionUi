/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

let configuredUserDataDir: string | null = null;

const PORTABLE_MARKER_FILE = 'portable-location.json';

type PortableMarker = {
  lastDataDir: string;
};

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

  // 3. Packaged app: directory containing executable
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

  // 4. Dev mode: check current working directory
  const cwd = process.cwd();
  if (isAionUiRoot(cwd)) {
    return cwd;
  }

  // 5. Walk up from __dirname
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
    if (!targetIsEmpty && sourceDbStat.size <= targetStat.size && sourceDbStat.mtimeMs <= targetStat.mtimeMs) {
      return;
    }
    console.log(
      `[AionUi:Portable] Source database at ${sourceDir} has newer/larger data than target (${sourceDbStat.size} vs ${targetStat.size} bytes, targetIsEmpty=${targetIsEmpty}). Migrating...`
    );
  }

  console.log(`[AionUi:Portable] Migrating existing user data from ${sourceDir} to ${targetDataDir}...`);
  try {
    const targetAionui = path.join(targetDataDir, 'aionui');
    const targetWal = path.join(targetAionui, 'aionui-backend.db-wal');
    const targetShm = path.join(targetAionui, 'aionui-backend.db-shm');
    try {
      if (fs.existsSync(targetWal)) fs.unlinkSync(targetWal);
      if (fs.existsSync(targetShm)) fs.unlinkSync(targetShm);
    } catch {
      // ignore
    }

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
 * Configure Electron app to store all data into the application folder itself.
 */
export function configurePortableUserData(app: Electron.App): string {
  if (configuredUserDataDir) {
    return configuredUserDataDir;
  }

  // E2E test isolation: keep tests on their isolated sandbox
  const e2eDir = process.env.AIONUI_E2E_TEST === '1' ? process.env.AIONUI_E2E_USER_DATA_DIR : undefined;
  if (e2eDir && e2eDir.trim() !== '') {
    const resolvedE2e = path.resolve(e2eDir.trim());
    fs.mkdirSync(resolvedE2e, { recursive: true });
    app.setPath('userData', resolvedE2e);
    configuredUserDataDir = resolvedE2e;
    return resolvedE2e;
  }

  const targetDataDir = getPortableUserDataDir();
  fs.mkdirSync(targetDataDir, { recursive: true });

  if (!process.env.VITEST) {
    migrateLegacyUserDataIfNeeded(app, targetDataDir);
  }

  app.setPath('userData', targetDataDir);

  const logsDir = path.join(targetDataDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  try {
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

  rebasePortableDatabase(targetDataDir);

  configuredUserDataDir = targetDataDir;
  return targetDataDir;
}

/**
 * Reset cached configured user data dir (used in tests).
 */
export function resetConfiguredUserDataDirForTesting(): void {
  configuredUserDataDir = null;
}
