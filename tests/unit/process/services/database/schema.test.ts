import { describe, expect, it } from 'vitest';
import { ALL_MIGRATIONS } from '@process/services/database/migrations';
import { CURRENT_DB_VERSION } from '@process/services/database/schema';

describe('database schema version', () => {
  it('matches the latest migration version', () => {
    const latestMigrationVersion = ALL_MIGRATIONS.at(-1)?.version;

    expect(latestMigrationVersion).toBeDefined();
    expect(CURRENT_DB_VERSION).toBe(latestMigrationVersion);
  });
});
