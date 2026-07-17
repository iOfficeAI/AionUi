// src/process/services/database/drivers/BunSqliteDriver.bun.test.ts
// Run with: bun test src/process/services/database/drivers/BunSqliteDriver.bun.test.ts

import { describe, it, expect, afterEach } from 'bun:test';
import { ALL_MIGRATIONS } from '../migrations';
import { BunSqliteDriver } from './BunSqliteDriver';

function getMigration(version: number) {
  const migration = ALL_MIGRATIONS.find((item) => item.version === version);
  if (!migration) {
    throw new Error(`Migration v${version} not found`);
  }
  return migration;
}

describe('BunSqliteDriver', () => {
  let driver: BunSqliteDriver;

  afterEach(() => {
    driver?.close();
  });

  it('exec and prepare().get() roundtrip', () => {
    driver = new BunSqliteDriver(':memory:');
    driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    driver.prepare('INSERT INTO t (val) VALUES (?)').run('hello');
    const row = driver.prepare('SELECT val FROM t WHERE id = 1').get() as { val: string };
    expect(row.val).toBe('hello');
  });

  it('prepare().all() returns array', () => {
    driver = new BunSqliteDriver(':memory:');
    driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    driver.prepare('INSERT INTO t (val) VALUES (?)').run('a');
    driver.prepare('INSERT INTO t (val) VALUES (?)').run('b');
    const rows = driver.prepare('SELECT val FROM t ORDER BY id').all() as Array<{ val: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].val).toBe('a');
    expect(rows[1].val).toBe('b');
  });

  it('prepare().run() returns changes and lastInsertRowid', () => {
    driver = new BunSqliteDriver(':memory:');
    driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    const result = driver.prepare('INSERT INTO t (val) VALUES (?)').run('x');
    expect(result.changes).toBe(1);
    expect(Number(result.lastInsertRowid)).toBe(1);
  });

  it('pragma() getter with simple:true returns scalar', () => {
    driver = new BunSqliteDriver(':memory:');
    const mode = driver.pragma('journal_mode', { simple: true });
    expect(typeof mode).toBe('string');
  });

  it('pragma() setter does not throw', () => {
    driver = new BunSqliteDriver(':memory:');
    expect(() => driver.pragma('foreign_keys = ON')).not.toThrow();
  });

  it('pragma() getter without options returns array', () => {
    driver = new BunSqliteDriver(':memory:');
    const result = driver.pragma('foreign_key_check');
    expect(Array.isArray(result)).toBe(true);
  });

  it('transaction() wraps function', () => {
    driver = new BunSqliteDriver(':memory:');
    driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    const insert = driver.transaction((val: unknown) => {
      driver.prepare('INSERT INTO t (val) VALUES (?)').run(val);
    });
    insert('wrapped');
    const row = driver.prepare('SELECT val FROM t').get() as { val: string };
    expect(row.val).toBe('wrapped');
  });

  it('migrates only legacy Codex ACP conversations to native Codex', () => {
    driver = new BunSqliteDriver(':memory:');
    driver.exec('CREATE TABLE conversations (id TEXT PRIMARY KEY, type TEXT NOT NULL, extra TEXT NOT NULL)');
    driver.prepare('INSERT INTO conversations (id, type, extra) VALUES (?, ?, ?)').run(
      'legacy-codex',
      'acp',
      JSON.stringify({
        backend: 'codex',
        workspace: '/tmp/workspace',
        currentModelId: 'gpt-5.3-codex',
        acpSessionId: 'legacy-acp-session',
      })
    );
    driver
      .prepare('INSERT INTO conversations (id, type, extra) VALUES (?, ?, ?)')
      .run('other-acp', 'acp', JSON.stringify({ backend: 'claude', workspace: '/tmp/other' }));

    getMigration(32).up(driver);

    const migrated = driver.prepare('SELECT type, extra FROM conversations WHERE id = ?').get('legacy-codex') as {
      type: string;
      extra: string;
    };
    const untouched = driver.prepare('SELECT type, extra FROM conversations WHERE id = ?').get('other-acp') as {
      type: string;
      extra: string;
    };

    expect(migrated.type).toBe('codex');
    expect(JSON.parse(migrated.extra)).toEqual(
      expect.objectContaining({
        backend: 'codex',
        workspace: '/tmp/workspace',
        currentModelId: 'gpt-5.3-codex',
        codexModel: 'gpt-5.3-codex',
        codexNative: true,
        codexMigratedFromAcp: true,
        acpSessionId: 'legacy-acp-session',
      })
    );
    expect(untouched.type).toBe('acp');
    expect(JSON.parse(untouched.extra)).toEqual({ backend: 'claude', workspace: '/tmp/other' });
  });

  it('rolls back only Codex conversations migrated from ACP', () => {
    driver = new BunSqliteDriver(':memory:');
    driver.exec('CREATE TABLE conversations (id TEXT PRIMARY KEY, type TEXT NOT NULL, extra TEXT NOT NULL)');
    driver
      .prepare('INSERT INTO conversations (id, type, extra) VALUES (?, ?, ?)')
      .run('legacy-codex', 'acp', JSON.stringify({ backend: 'codex', currentModelId: 'gpt-5.3-codex' }));
    driver
      .prepare('INSERT INTO conversations (id, type, extra) VALUES (?, ?, ?)')
      .run(
        'native-codex',
        'codex',
        JSON.stringify({ backend: 'codex', codexNative: true, currentModelId: 'gpt-5.3-codex' })
      );

    const migration = getMigration(32);
    migration.up(driver);
    migration.down(driver);

    const legacy = driver.prepare('SELECT type, extra FROM conversations WHERE id = ?').get('legacy-codex') as {
      type: string;
      extra: string;
    };
    const native = driver.prepare('SELECT type, extra FROM conversations WHERE id = ?').get('native-codex') as {
      type: string;
      extra: string;
    };

    expect(legacy.type).toBe('acp');
    expect(JSON.parse(legacy.extra)).not.toHaveProperty('codexNative');
    expect(native.type).toBe('codex');
    expect(JSON.parse(native.extra)).toEqual({
      backend: 'codex',
      codexNative: true,
      currentModelId: 'gpt-5.3-codex',
    });
  });
});
