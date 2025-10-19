/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SQLite adapter to handle better-sqlite3 loading in both development and production
 * Resolves module path issues in ASAR-packaged applications
 */

import type Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

let betterSqlite3Module: typeof Database | null = null;

/**
 * Get the better-sqlite3 module with proper path resolution for ASAR packaging
 */
export function getBetterSqlite3(): typeof Database {
  if (betterSqlite3Module) {
    return betterSqlite3Module;
  }

  try {
    // Try normal require first (works in development and when properly packaged)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    betterSqlite3Module = require('better-sqlite3');
    return betterSqlite3Module;
  } catch (error) {
    console.error('[SQLiteAdapter] Failed to load better-sqlite3 via normal require:', error);

    // In production ASAR package, the module might be in app.asar.unpacked
    if (app.isPackaged) {
      try {
        const appPath = app.getAppPath();
        console.log('[SQLiteAdapter] App path:', appPath);

        // Try different possible locations for unpacked modules
        const possiblePaths = [
          // Standard ASAR unpacked location
          path.join(path.dirname(appPath), 'app.asar.unpacked', 'node_modules', 'better-sqlite3'),
          // Alternative: if app.asar is in resources
          path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'node_modules', 'better-sqlite3'),
          // Direct node_modules (non-ASAR build)
          path.join(appPath, 'node_modules', 'better-sqlite3'),
        ];

        for (const modulePath of possiblePaths) {
          try {
            console.log('[SQLiteAdapter] Trying to load from:', modulePath);
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            betterSqlite3Module = require(modulePath);
            console.log('[SQLiteAdapter] Successfully loaded better-sqlite3 from:', modulePath);
            return betterSqlite3Module;
          } catch (e) {
            // Continue to next path
            console.log('[SQLiteAdapter] Not found at:', modulePath);
          }
        }

        throw new Error('Failed to load better-sqlite3 from any known location. Tried: ' + possiblePaths.join(', '));
      } catch (fallbackError) {
        console.error('[SQLiteAdapter] All fallback paths failed:', fallbackError);
        throw fallbackError;
      }
    }

    throw error;
  }
}

/**
 * Create a new database instance with proper module loading
 */
export function createDatabase(dbPath: string, options?: Database.Options): Database.Database {
  const DatabaseConstructor = getBetterSqlite3();
  return new DatabaseConstructor(dbPath, options);
}
