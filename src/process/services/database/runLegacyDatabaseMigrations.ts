/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import path from 'path';
import { ensureDirectory, getDataPath } from '@process/utils';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import { runMigrations } from '@process/services/database/migrations';
import {
  CURRENT_DB_VERSION,
  getDatabaseVersion,
  initSchema,
  setDatabaseVersion,
} from '@process/services/database/schema';

const DEFAULT_USER_ID = 'system_default_user';
const DEFAULT_PASSWORD_PLACEHOLDER = '';

export type LegacyDatabaseMigrationResult = {
  dbPath: string;
  fromVersion: number | null;
  toVersion: number;
  migrated: boolean;
  skipped: boolean;
};

export function resolveLegacyDatabasePath(dataDir = getDataPath()): string {
  return path.join(dataDir, 'aionui.db');
}

function ensureSystemUser(db: ISqliteDriver): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, avatar_path, created_at, updated_at, last_login, jwt_secret)
     VALUES (?, ?, NULL, ?, NULL, ?, ?, NULL, NULL)`
  ).run(DEFAULT_USER_ID, DEFAULT_USER_ID, DEFAULT_PASSWORD_PLACEHOLDER, now, now);
}

/**
 * Upgrade legacy Electron-managed SQLite catalogs to the v26 baseline before
 * the backend starts. The driver is opened only for the duration of this
 * one-shot migration pass and is always closed before returning.
 */
export async function runLegacyDatabaseMigrations(
  dbPath = resolveLegacyDatabasePath()
): Promise<LegacyDatabaseMigrationResult> {
  if (!existsSync(dbPath)) {
    return {
      dbPath,
      fromVersion: null,
      toVersion: CURRENT_DB_VERSION,
      migrated: false,
      skipped: true,
    };
  }

  ensureDirectory(path.dirname(dbPath));

  const { BetterSqlite3Driver } = await import('@process/services/database/drivers/BetterSqlite3Driver');
  const driver = new BetterSqlite3Driver(dbPath);

  try {
    initSchema(driver);
    const currentVersion = getDatabaseVersion(driver);

    if (currentVersion < CURRENT_DB_VERSION) {
      runMigrations(driver, currentVersion, CURRENT_DB_VERSION);
      setDatabaseVersion(driver, CURRENT_DB_VERSION);
    }

    ensureSystemUser(driver);

    return {
      dbPath,
      fromVersion: currentVersion,
      toVersion: CURRENT_DB_VERSION,
      migrated: currentVersion < CURRENT_DB_VERSION,
      skipped: false,
    };
  } finally {
    driver.close();
  }
}
