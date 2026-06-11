/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeSqliteDriver } from '@process/services/database/drivers/NodeSqliteDriver';

describe('NodeSqliteDriver', () => {
  let db: NodeSqliteDriver;

  beforeEach(() => {
    db = new NodeSqliteDriver(':memory:');
    db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, n INTEGER);`);
  });

  afterEach(() => {
    db.close();
  });

  it('run() returns numeric changes and lastInsertRowid', () => {
    const res = db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('a', 1);
    expect(res.changes).toBe(1);
    expect(typeof res.changes).toBe('number');
    expect(res.lastInsertRowid).toBe(1);
  });

  it('get() returns a row, all() returns every row', () => {
    db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('a', 1);
    db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('b', 2);
    expect(db.prepare('SELECT name FROM t WHERE id = ?').get(1)).toMatchObject({ name: 'a' });
    expect(db.prepare('SELECT * FROM t').all()).toHaveLength(2);
  });

  it('pragma() returns rows by default', () => {
    const cols = db.pragma('table_info(t)') as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual(['id', 'name', 'n']);
  });

  it('pragma() with { simple: true } returns the first scalar value', () => {
    db.exec('PRAGMA user_version = 7');
    expect(db.pragma('user_version', { simple: true })).toBe(7);
  });

  it('pragma() can set values', () => {
    db.pragma('user_version = 3');
    expect(db.pragma('user_version', { simple: true })).toBe(3);
  });

  it('leaves foreign_keys OFF by default (parity with better-sqlite3)', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(0);
  });

  it('transaction() commits on success', () => {
    const insertTwo = db.transaction(() => {
      db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('x', 1);
      db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('y', 2);
    });
    insertTwo();
    expect((db.prepare('SELECT count(*) c FROM t').get() as { c: number }).c).toBe(2);
  });

  it('transaction() rolls back on throw', () => {
    const boom = db.transaction(() => {
      db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('x', 1);
      throw new Error('boom');
    });
    expect(() => boom()).toThrow('boom');
    expect((db.prepare('SELECT count(*) c FROM t').get() as { c: number }).c).toBe(0);
  });

  it('transaction() forwards arguments and return value', () => {
    const add = db.transaction((a: unknown, b: unknown) => (a as number) + (b as number));
    expect(add(2, 3)).toBe(5);
  });

  it('supports nested transactions via savepoints', () => {
    const outer = db.transaction(() => {
      db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('outer', 1);
      const inner = db.transaction(() => {
        db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('inner', 2);
        throw new Error('inner-fail');
      });
      // Inner rolls back to its savepoint; outer continues and commits.
      expect(() => inner()).toThrow('inner-fail');
      db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('after-inner', 3);
    });
    outer();
    const names = (db.prepare('SELECT name FROM t ORDER BY id').all() as Array<{ name: string }>).map((r) => r.name);
    expect(names).toEqual(['outer', 'after-inner']);
  });
});
