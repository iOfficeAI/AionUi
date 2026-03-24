// src/process/services/database/drivers/BunSqliteDriver.bun.test.ts
// Run with: bun test src/process/services/database/drivers/BunSqliteDriver.bun.test.ts

import { describe, it, expect, afterEach } from 'bun:test';
import { BunSqliteDriver } from './BunSqliteDriver';

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
});
