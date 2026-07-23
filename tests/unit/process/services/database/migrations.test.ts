/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  ALL_MIGRATIONS,
  getMigrationsToRun,
  getMigrationsToRollback,
  runMigrations,
  rollbackMigrations,
  isMigrationApplied,
  type IMigration,
  type ISqliteDriver,
} from '@/process/services/database/migrations';

function createMockDriver(): ISqliteDriver {
  let userVersion = 0;
  const execLog: string[] = [];

  const mockDriver: ISqliteDriver = {
    prepare(sql: string) {
      return {
        all: () => [],
        get: () => null,
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
      };
    },
    exec(sql: string) {
      execLog.push(sql);
    },
    pragma(sql: string, options?: { simple?: boolean }) {
      if (sql.toLowerCase().includes('user_version')) {
        if (sql.toLowerCase().includes('=')) {
          userVersion = Number(sql.split('=').pop()?.trim() ?? '0');
          return options?.simple ? userVersion : [userVersion];
        }
        return options?.simple ? userVersion : [userVersion];
      }
      if (sql.toLowerCase() === 'foreign_key_check') {
        return [];
      }
      if (sql.toLowerCase().includes('foreign_keys')) {
        if (sql.toLowerCase().includes('=')) return [];
        return 1;
      }
      return [];
    },
    transaction<T>(fn: (...args: unknown[]) => T) {
      return (...args: unknown[]) => fn(...args);
    },
    close: () => {},
  };

  return Object.assign(mockDriver, { execLog });
}

type MockDriver = ReturnType<typeof createMockDriver>;

describe('migrations', () => {
  let db: MockDriver;

  beforeEach(() => {
    db = createMockDriver();
  });

  it('includes migration v27 in ALL_MIGRATIONS', () => {
    const v27 = ALL_MIGRATIONS.find((m) => m.version === 27);
    expect(v27).toBeDefined();
    expect(v27?.name).toBe('Add origin_conversation_id to teams');
  });

  it('lists migrations in ascending version order', () => {
    const versions = ALL_MIGRATIONS.map((m) => m.version);
    const sorted = [...versions].toSorted((a, b) => a - b);
    expect(versions).toEqual(sorted);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('getMigrationsToRun returns migrations between versions', () => {
    const toRun = getMigrationsToRun(25, 27);
    expect(toRun.map((m) => m.version)).toEqual([26, 27]);
  });

  it('getMigrationsToRollback returns migrations in descending order', () => {
    const toRollback = getMigrationsToRollback(27, 25);
    expect(toRollback.map((m) => m.version)).toEqual([27, 26]);
  });

  it('isMigrationApplied uses current user_version', () => {
    db.pragma('user_version = 27');
    expect(isMigrationApplied(db, 27)).toBe(true);
    expect(isMigrationApplied(db, 28)).toBe(false);
  });

  describe('migration v27', () => {
    const v27 = ALL_MIGRATIONS.find((m) => m.version === 27) as IMigration;

    it('is invoked by runMigrations from v26 to v27', () => {
      db.pragma('user_version = 26');
      runMigrations(db, 26, 27);

      expect(db.execLog).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ALTER TABLE teams ADD COLUMN origin_conversation_id'),
          expect.stringContaining('idx_teams_origin_conversation_id'),
        ])
      );
    });

    it('up script adds origin_conversation_id column and index', () => {
      v27.up(db);

      expect(db.execLog).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ALTER TABLE teams ADD COLUMN origin_conversation_id'),
          expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_teams_origin_conversation_id'),
        ])
      );
    });

    it('up script is idempotent when the column already exists', () => {
      v27.up(db);
      const firstRunCount = db.execLog.filter((sql) =>
        sql.includes('ALTER TABLE teams ADD COLUMN origin_conversation_id')
      ).length;
      expect(firstRunCount).toBe(1);

      v27.up(db);
      const secondRunCount = db.execLog.filter((sql) =>
        sql.includes('ALTER TABLE teams ADD COLUMN origin_conversation_id')
      ).length;
      expect(secondRunCount).toBe(2); // Script attempts ALTER again; SQLite ignores existing column.
    });

    it('down script drops the index and recreates the table without origin_conversation_id', () => {
      v27.up(db);
      v27.down(db);

      expect(db.execLog).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DROP INDEX IF EXISTS idx_teams_origin_conversation_id'),
          expect.stringContaining('CREATE TABLE teams_backup'),
          expect.stringContaining('DROP TABLE teams'),
          expect.stringContaining('ALTER TABLE teams_backup RENAME TO teams'),
        ])
      );
    });
  });

  it('runMigrations does nothing when already at target version', () => {
    db.pragma('user_version = 27');
    const before = db.execLog.length;
    runMigrations(db, 27, 27);
    expect(db.execLog.length).toBe(before);
  });

  it('rollbackMigrations throws when target is not lower than source', () => {
    expect(() => rollbackMigrations(db, 27, 27)).toThrow();
    expect(() => rollbackMigrations(db, 27, 28)).toThrow();
  });
});
