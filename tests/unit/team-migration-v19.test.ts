// tests/unit/team-migration-v19.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initSchema } from '@process/services/database/schema';
import { runMigrations, ALL_MIGRATIONS } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';

describe('migration v19: teams table', () => {
  let driver: BetterSqlite3Driver;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, 18); // bring to v18
  });

  afterEach(() => {
    driver.close();
  });

  it('creates teams table with correct columns', () => {
    runMigrations(driver, 18, 19);
    const cols = (driver.pragma('table_info(teams)') as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('name');
    expect(cols).toContain('workspace');
    expect(cols).toContain('workspace_mode');
    expect(cols).toContain('agents');
    expect(cols).toContain('created_at');
    expect(cols).toContain('updated_at');
  });

  it('rollback drops teams table', () => {
    runMigrations(driver, 18, 19);
    // rollback by calling migration down directly
    ALL_MIGRATIONS.find((m) => m.version === 19)!.down(driver);
    const tables = driver.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teams'").all() as Array<{
      name: string;
    }>;
    expect(tables).toHaveLength(0);
  });
});
