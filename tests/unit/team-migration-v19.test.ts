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

describe('migration v20: lead_agent_id, mailbox, team_tasks', () => {
  let driver: BetterSqlite3Driver;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, 19); // bring to v19
  });

  afterEach(() => {
    driver.close();
  });

  it('adds lead_agent_id column to teams table', () => {
    runMigrations(driver, 19, 20);
    const cols = (driver.pragma('table_info(teams)') as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('lead_agent_id');
  });

  it('creates mailbox table with correct columns', () => {
    runMigrations(driver, 19, 20);
    const cols = (driver.pragma('table_info(mailbox)') as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('team_id');
    expect(cols).toContain('to_agent_id');
    expect(cols).toContain('from_agent_id');
    expect(cols).toContain('type');
    expect(cols).toContain('content');
    expect(cols).toContain('summary');
    expect(cols).toContain('read');
    expect(cols).toContain('created_at');
  });

  it('creates team_tasks table with correct columns', () => {
    runMigrations(driver, 19, 20);
    const cols = (driver.pragma('table_info(team_tasks)') as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('team_id');
    expect(cols).toContain('subject');
    expect(cols).toContain('description');
    expect(cols).toContain('status');
    expect(cols).toContain('owner');
    expect(cols).toContain('blocked_by');
    expect(cols).toContain('blocks');
    expect(cols).toContain('metadata');
    expect(cols).toContain('created_at');
    expect(cols).toContain('updated_at');
  });

  it('rollback drops mailbox and team_tasks tables', () => {
    runMigrations(driver, 19, 20);
    ALL_MIGRATIONS.find((m) => m.version === 20)!.down(driver);
    const mailboxTables = driver
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mailbox'")
      .all() as Array<{ name: string }>;
    const taskTables = driver
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='team_tasks'")
      .all() as Array<{ name: string }>;
    expect(mailboxTables).toHaveLength(0);
    expect(taskTables).toHaveLength(0);
  });
});
