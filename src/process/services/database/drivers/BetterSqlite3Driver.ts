// src/process/services/database/drivers/BetterSqlite3Driver.ts

import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ISqliteDriver, IStatement } from './ISqliteDriver';

/**
 * Resolve the native binding path for better-sqlite3 in packaged Electron apps.
 *
 * When the app is packaged with electron-builder, better-sqlite3's .node file
 * is unpacked to app.asar.unpacked/ but the `bindings` module searches inside
 * app.asar/ where the build/ directory has no entry. Electron's fs patch can't
 * redirect because the file isn't in the asar header at all.
 *
 * This function resolves the real path by checking app.asar.unpacked directly.
 */
export function resolveNativeBinding(): string | undefined {
  try {
    // Normalize to forward slashes for reliable cross-platform matching
    const normalized = __dirname.replace(/\\/g, '/');
    const marker = 'app.asar/';
    const idx = normalized.indexOf(marker);
    if (idx === -1) return undefined;
    const appAsarPath = normalized.substring(0, idx + 'app.asar'.length);
    const unpackedRoot = appAsarPath.replace('app.asar', 'app.asar.unpacked');
    const nodePath = path.join(
      unpackedRoot,
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node'
    );
    if (fs.existsSync(nodePath)) {
      return nodePath;
    }
  } catch {
    // Not in a packaged app, or path resolution failed — let bindings handle it
  }
  return undefined;
}

class BetterSqlite3Statement implements IStatement {
  constructor(private stmt: Database.Statement) {}

  get(...args: unknown[]): unknown {
    return this.stmt.get(...args);
  }

  all(...args: unknown[]): unknown[] {
    return this.stmt.all(...args) as unknown[];
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.stmt.run(...args);
  }
}

export class BetterSqlite3Driver implements ISqliteDriver {
  private db: Database.Database;

  constructor(dbPath: string) {
    const nativeBinding = resolveNativeBinding();
    this.db = nativeBinding ? new BetterSqlite3(dbPath, { nativeBinding }) : new BetterSqlite3(dbPath);
  }

  prepare(sql: string): IStatement {
    return new BetterSqlite3Statement(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    return this.db.pragma(sql, options);
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}
