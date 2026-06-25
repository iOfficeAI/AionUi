/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDriver = {
  prepare: vi.fn(() => ({
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
  })),
  close: vi.fn(),
  exec: vi.fn(),
};

vi.mock('@process/services/database/drivers/BetterSqlite3Driver', () => ({
  BetterSqlite3Driver: class {
    constructor() {
      return mockDriver;
    }
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('@process/utils', () => ({
  ensureDirectory: vi.fn(),
  getDataPath: () => '/data',
}));

vi.mock('@process/services/database/schema', () => ({
  CURRENT_DB_VERSION: 26,
  getDatabaseVersion: vi.fn(() => 20),
  initSchema: vi.fn(),
  setDatabaseVersion: vi.fn(),
}));

vi.mock('@process/services/database/migrations', () => ({
  runMigrations: vi.fn(),
}));

vi.mock('@process/services/database/repairLegacyHandoffSchema', () => ({
  repairLegacyHandoffSchema: vi.fn(() => ({
    repairedColumns: [{ table: 'teams', column: 'session_mode' }],
    skippedTables: [],
  })),
}));

import { existsSync } from 'fs';
import { runLegacyDatabaseMigrations } from '@process/services/database/runLegacyDatabaseMigrations';
import { getDatabaseVersion, setDatabaseVersion } from '@process/services/database/schema';
import { runMigrations } from '@process/services/database/migrations';
import { repairLegacyHandoffSchema } from '@process/services/database/repairLegacyHandoffSchema';

describe('configMigrationIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (existsSync as any).mockReturnValue(true);
    (getDatabaseVersion as any).mockReturnValue(20);
  });

  it('runs migrations when database version is outdated', async () => {
    const result = await runLegacyDatabaseMigrations('/test/aionui.db');

    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(20);
    expect(result.toVersion).toBe(26);
    expect(runMigrations).toHaveBeenCalledWith(mockDriver, 20, 26);
    expect(setDatabaseVersion).toHaveBeenCalledWith(mockDriver, 26);
  });

  it('skips migrations when database does not exist', async () => {
    (existsSync as any).mockReturnValue(false);

    const result = await runLegacyDatabaseMigrations('/test/aionui.db');

    expect(result.skipped).toBe(true);
    expect(result.migrated).toBe(false);
    expect(result.handoffRepair).toEqual({ repairedColumns: [], skippedTables: [] });
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it('runs handoff repair even when database version is current', async () => {
    (getDatabaseVersion as any).mockReturnValue(26);

    const result = await runLegacyDatabaseMigrations('/test/aionui.db');

    expect(runMigrations).not.toHaveBeenCalled();
    expect(setDatabaseVersion).not.toHaveBeenCalled();
    expect(repairLegacyHandoffSchema).toHaveBeenCalledWith(mockDriver);
    expect(result.migrated).toBe(false);
    expect(result.handoffRepair.repairedColumns).toEqual([{ table: 'teams', column: 'session_mode' }]);
  });

  it('closes driver after migration completes', async () => {
    await runLegacyDatabaseMigrations('/test/aionui.db');

    expect(mockDriver.close).toHaveBeenCalled();
  });

  it('ensures system user exists after migration', async () => {
    await runLegacyDatabaseMigrations('/test/aionui.db');

    expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO users'));
  });

  it('closes driver even if migration throws', async () => {
    (runMigrations as any).mockImplementation(() => {
      throw new Error('Migration failed');
    });

    await expect(runLegacyDatabaseMigrations('/test/aionui.db')).rejects.toThrow('Migration failed');
    expect(mockDriver.close).toHaveBeenCalled();
  });
});
