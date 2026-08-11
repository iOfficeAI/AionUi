import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ALL_MIGRATIONS } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';

let nativeModuleAvailable = true;
try {
  const d = new BetterSqlite3Driver(':memory:');
  d.close();
} catch (e) {
  if (e instanceof Error && e.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  }
}

const describeOrSkip = nativeModuleAvailable ? describe : describe.skip;

function getMigration(version: number) {
  const migration = ALL_MIGRATIONS.find((item) => item.version === version);
  if (!migration) {
    throw new Error(`Migration v${version} not found`);
  }
  return migration;
}

function createUsersTable(driver: BetterSqlite3Driver): void {
  driver.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_path TEXT,
    jwt_secret TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login INTEGER
  )`);
}

function createLegacyTeamsTable(driver: BetterSqlite3Driver): void {
  driver.exec(`CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    workspace TEXT NOT NULL,
    workspace_mode TEXT NOT NULL DEFAULT 'shared',
    agents TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  driver.exec('CREATE INDEX idx_teams_user_id ON teams(user_id)');
  driver.exec('CREATE INDEX idx_teams_updated_at ON teams(updated_at)');
}

describeOrSkip('migration v24: teams table', () => {
  let driver: BetterSqlite3Driver;
  const migrationV24 = getMigration(24);

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    createUsersTable(driver);
  });

  afterEach(() => {
    driver.close();
  });

  it('creates teams table with correct columns', () => {
    migrationV24.up(driver);

    const cols = (driver.pragma('table_info(teams)') as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('name');
    expect(cols).toContain('workspace');
    expect(cols).toContain('workspace_mode');
    expect(cols).toContain('agents');
    expect(cols).toContain('created_at');
    expect(cols).toContain('updated_at');
    expect(cols).not.toContain('lead_agent_id');
  });

  it('rollback drops teams table', () => {
    migrationV24.up(driver);
    migrationV24.down(driver);

    const tables = driver.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teams'").all() as Array<{
      name: string;
    }>;
    expect(tables).toHaveLength(0);
  });
});

describeOrSkip('migration v25: lead_agent_id, mailbox, team_tasks', () => {
  let driver: BetterSqlite3Driver;
  const migrationV25 = getMigration(25);

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    createUsersTable(driver);
    createLegacyTeamsTable(driver);
  });

  afterEach(() => {
    driver.close();
  });

  it('adds lead_agent_id column to teams table', () => {
    migrationV25.up(driver);

    const cols = (driver.pragma('table_info(teams)') as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('lead_agent_id');
  });

  it('creates mailbox table with correct columns', () => {
    migrationV25.up(driver);

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
    migrationV25.up(driver);

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
    migrationV25.up(driver);
    migrationV25.down(driver);

    const mailboxTables = driver
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mailbox'")
      .all() as Array<{ name: string }>;
    const taskTables = driver
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='team_tasks'")
      .all() as Array<{ name: string }>;
    const teamColumns = (driver.pragma('table_info(teams)') as Array<{ name: string }>).map((c) => c.name);

    expect(mailboxTables).toHaveLength(0);
    expect(taskTables).toHaveLength(0);
    expect(teamColumns).toContain('lead_agent_id');
  });
});
