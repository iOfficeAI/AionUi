/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initSchema = vi.fn();
const getDatabaseVersion = vi.fn();
const setDatabaseVersion = vi.fn();
const runMigrations = vi.fn();
const ensureDirectory = vi.fn();

const prepareRun = vi.fn();
const close = vi.fn();
let lastConstructedPath: string | null = null;

class MockBetterSqlite3Driver {
  constructor(dbPath: string) {
    lastConstructedPath = dbPath;
  }

  prepare(_sql: string) {
    return {
      run: prepareRun,
    };
  }

  exec(_sql: string): void {}

  pragma(_sql: string, _options?: { simple?: boolean }): unknown {
    return 0;
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return fn;
  }

  close(): void {
    close();
  }
}

describe('runLegacyDatabaseMigrations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    lastConstructedPath = null;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('@process/utils');
    vi.doUnmock('@process/services/database/schema');
    vi.doUnmock('@process/services/database/migrations');
    vi.doUnmock('@process/services/database/drivers/BetterSqlite3Driver');
  });

  it('migrates an existing legacy database and closes the driver before returning', async () => {
    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('@process/utils', () => ({
      ensureDirectory,
      getDataPath: vi.fn(() => '/tmp/aionui'),
    }));
    vi.doMock('@process/services/database/schema', () => ({
      CURRENT_DB_VERSION: 26,
      getDatabaseVersion,
      initSchema,
      setDatabaseVersion,
    }));
    vi.doMock('@process/services/database/migrations', () => ({
      runMigrations,
    }));
    vi.doMock('@process/services/database/drivers/BetterSqlite3Driver', () => ({
      BetterSqlite3Driver: MockBetterSqlite3Driver,
    }));

    getDatabaseVersion.mockReturnValue(12);

    const { runLegacyDatabaseMigrations } = await import('@process/services/database/runLegacyDatabaseMigrations');

    const result = await runLegacyDatabaseMigrations('/tmp/aionui/aionui.db');

    expect(lastConstructedPath).toBe('/tmp/aionui/aionui.db');
    expect(ensureDirectory).toHaveBeenCalledWith('/tmp/aionui');
    expect(initSchema).toHaveBeenCalledOnce();
    expect(getDatabaseVersion).toHaveBeenCalledOnce();
    expect(runMigrations).toHaveBeenCalledOnce();
    expect(setDatabaseVersion).toHaveBeenCalledWith(expect.any(MockBetterSqlite3Driver), 26);
    expect(prepareRun).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(result).toEqual({
      dbPath: '/tmp/aionui/aionui.db',
      fromVersion: 12,
      toVersion: 26,
      migrated: true,
      skipped: false,
    });
  });

  it('skips cleanly when the legacy database file does not exist', async () => {
    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
    }));
    vi.doMock('@process/utils', () => ({
      ensureDirectory,
      getDataPath: vi.fn(() => '/tmp/aionui'),
    }));
    vi.doMock('@process/services/database/schema', () => ({
      CURRENT_DB_VERSION: 26,
      getDatabaseVersion,
      initSchema,
      setDatabaseVersion,
    }));
    vi.doMock('@process/services/database/migrations', () => ({
      runMigrations,
    }));

    const { runLegacyDatabaseMigrations } = await import('@process/services/database/runLegacyDatabaseMigrations');

    const result = await runLegacyDatabaseMigrations('/tmp/aionui/aionui.db');

    expect(lastConstructedPath).toBeNull();
    expect(initSchema).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(result).toEqual({
      dbPath: '/tmp/aionui/aionui.db',
      fromVersion: null,
      toVersion: 26,
      migrated: false,
      skipped: true,
    });
  });
});
