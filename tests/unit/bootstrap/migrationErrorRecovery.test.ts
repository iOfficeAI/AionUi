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
  existsSync: vi.fn(() => true),
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

import { runLegacyDatabaseMigrations } from '@process/services/database/runLegacyDatabaseMigrations';
import { runMigrations } from '@process/services/database/migrations';
import { initSchema, setDatabaseVersion } from '@process/services/database/schema';

describe('migrationErrorRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (initSchema as any).mockImplementation(() => {});
    (runMigrations as any).mockImplementation(() => {});
    (setDatabaseVersion as any).mockImplementation(() => {});
    mockDriver.prepare.mockImplementation(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    }));
  });

  it('closes driver when initSchema throws', async () => {
    (initSchema as any).mockImplementation(() => {
      throw new Error('Schema init failed');
    });

    await expect(runLegacyDatabaseMigrations('/test/aionui.db')).rejects.toThrow('Schema init failed');
    expect(mockDriver.close).toHaveBeenCalled();
  });

  it('closes driver when runMigrations throws', async () => {
    (runMigrations as any).mockImplementation(() => {
      throw new Error('Migration step failed');
    });

    await expect(runLegacyDatabaseMigrations('/test/aionui.db')).rejects.toThrow('Migration step failed');
    expect(mockDriver.close).toHaveBeenCalled();
  });

  it('closes driver when setDatabaseVersion throws', async () => {
    (setDatabaseVersion as any).mockImplementation(() => {
      throw new Error('Set version failed');
    });

    await expect(runLegacyDatabaseMigrations('/test/aionui.db')).rejects.toThrow('Set version failed');
    expect(mockDriver.close).toHaveBeenCalled();
  });

  it('closes driver when system user insert throws', async () => {
    mockDriver.prepare.mockImplementation(() => {
      throw new Error('User insert failed');
    });

    await expect(runLegacyDatabaseMigrations('/test/aionui.db')).rejects.toThrow('User insert failed');
    expect(mockDriver.close).toHaveBeenCalled();
  });

  it('skips migration gracefully when database path is invalid', async () => {
    const { existsSync } = await import('fs');
    (existsSync as any).mockReturnValue(false);

    const result = await runLegacyDatabaseMigrations('/invalid/path.db');

    expect(result.skipped).toBe(true);
    expect(mockDriver.close).not.toHaveBeenCalled();
  });
});
