/**
 * Contract tests for aionui-db Rust crate.
 *
 * These tests verify that the Rust Database class provides the same
 * operations as better-sqlite3 for the SQL patterns used by AionUIDatabase.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { Database } from '@aionui/native';
import type { RunResult } from '@aionui/native';

// ============================================================================
// Test helpers
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aionui-db-contract-'));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function dbPath(name = 'test.db'): string {
  return path.join(tmpDir, name);
}

// ============================================================================
// Constructor / Close
// ============================================================================

describe('Database constructor', () => {
  it('opens an in-memory database', () => {
    const db = new Database(':memory:');
    db.close();
  });

  it('creates a file-based database', () => {
    const p = dbPath();
    const db = new Database(p);
    db.exec('CREATE TABLE t (id INTEGER)');
    db.close();

    // Reopen and verify table exists
    const db2 = new Database(p);
    const row = db2.get('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', 't']);
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).name).toBe('t');
    db2.close();
  });

  it('throws on invalid path', () => {
    expect(() => new Database('/nonexistent/dir/db.sqlite')).toThrow();
  });
});

describe('Database.close', () => {
  it('closes the connection', () => {
    const db = new Database(':memory:');
    db.close();
  });

  it('throws on subsequent operations after close', () => {
    const db = new Database(':memory:');
    db.close();
    expect(() => db.exec('SELECT 1')).toThrow(/closed/i);
  });
});

// ============================================================================
// exec
// ============================================================================

describe('Database.exec', () => {
  it('executes CREATE TABLE', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    db.close();
  });

  it('executes multi-statement DDL', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE a (id INTEGER);
      CREATE TABLE b (id INTEGER);
      CREATE TABLE c (id INTEGER);
    `);

    const tables = db.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((r) => r.name)).toEqual(['a', 'b', 'c']);
    db.close();
  });

  it('throws on invalid SQL', () => {
    const db = new Database(':memory:');
    expect(() => db.exec('NOT VALID SQL')).toThrow();
    db.close();
  });
});

// ============================================================================
// run
// ============================================================================

describe('Database.run', () => {
  it('INSERT returns changes=1 and correct lastInsertRowid', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');

    const result: RunResult = db.run('INSERT INTO t (name) VALUES (?)', ['alice']);
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);

    const result2 = db.run('INSERT INTO t (name) VALUES (?)', ['bob']);
    expect(result2.lastInsertRowid).toBe(2);
    db.close();
  });

  it('UPDATE returns correct changes count', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)');
    db.run('INSERT INTO t (v) VALUES (?)', [1]);
    db.run('INSERT INTO t (v) VALUES (?)', [1]);
    db.run('INSERT INTO t (v) VALUES (?)', [2]);

    const result = db.run('UPDATE t SET v = ? WHERE v = ?', [99, 1]);
    expect(result.changes).toBe(2);
    db.close();
  });

  it('DELETE returns correct changes count', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    db.run('INSERT INTO t DEFAULT VALUES', []);
    db.run('INSERT INTO t DEFAULT VALUES', []);

    const result = db.run('DELETE FROM t', []);
    expect(result.changes).toBe(2);
    db.close();
  });

  it('works without params argument', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

    const result = db.run('INSERT INTO t DEFAULT VALUES');
    expect(result.changes).toBe(1);
    db.close();
  });
});

// ============================================================================
// get
// ============================================================================

describe('Database.get', () => {
  it('returns object with column names', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');
    db.run('INSERT INTO t (id, name, age) VALUES (?, ?, ?)', [1, 'alice', 30]);

    const row = db.get('SELECT id, name, age FROM t WHERE id = ?', [1]) as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.id).toBe(1);
    expect(row.name).toBe('alice');
    expect(row.age).toBe(30);
    db.close();
  });

  it('returns null for no match', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

    const row = db.get('SELECT * FROM t WHERE id = ?', [999]);
    expect(row).toBeNull();
    db.close();
  });

  it('handles NULL columns', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER, v TEXT)');
    db.run('INSERT INTO t (id, v) VALUES (?, ?)', [1, null]);

    const row = db.get('SELECT id, v FROM t WHERE id = ?', [1]) as Record<string, unknown>;
    expect(row.id).toBe(1);
    expect(row.v).toBeNull();
    db.close();
  });

  it('works without params argument', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER)');
    db.run('INSERT INTO t (id) VALUES (1)');

    const row = db.get('SELECT * FROM t') as Record<string, unknown>;
    expect(row.id).toBe(1);
    db.close();
  });
});

// ============================================================================
// all
// ============================================================================

describe('Database.all', () => {
  it('returns array of objects', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    db.run('INSERT INTO t (name) VALUES (?)', ['alice']);
    db.run('INSERT INTO t (name) VALUES (?)', ['bob']);

    const rows = db.all('SELECT name FROM t ORDER BY name');
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('alice');
    expect(rows[1].name).toBe('bob');
    db.close();
  });

  it('empty result returns empty array', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER)');

    const rows = db.all('SELECT * FROM t');
    expect(rows).toEqual([]);
    db.close();
  });

  it('ORDER BY is respected', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (v INTEGER)');
    db.run('INSERT INTO t (v) VALUES (?)', [3]);
    db.run('INSERT INTO t (v) VALUES (?)', [1]);
    db.run('INSERT INTO t (v) VALUES (?)', [2]);

    const rows = db.all('SELECT v FROM t ORDER BY v ASC');
    expect(rows.map((r) => r.v)).toEqual([1, 2, 3]);
    db.close();
  });
});

// ============================================================================
// pragmaGet / pragmaSet
// ============================================================================

describe('pragmaGet / pragmaSet', () => {
  it('get and set user_version', () => {
    const db = new Database(':memory:');
    db.pragmaSet('user_version = 42');

    const val = db.pragmaGet('user_version');
    expect(val).toBe(42);
    db.close();
  });

  it('journal_mode returns a string', () => {
    const p = dbPath('pragma-test.db');
    const db = new Database(p);
    db.pragmaSet('journal_mode = WAL');

    const mode = db.pragmaGet('journal_mode');
    expect(typeof mode).toBe('string');
    expect(mode).toBe('wal');
    db.close();
  });

  it('foreign_keys toggle', () => {
    const db = new Database(':memory:');
    db.pragmaSet('foreign_keys = ON');

    const val = db.pragmaGet('foreign_keys');
    expect(val).toBe(1);

    db.pragmaSet('foreign_keys = OFF');
    const val2 = db.pragmaGet('foreign_keys');
    expect(val2).toBe(0);
    db.close();
  });
});

// ============================================================================
// Type mapping
// ============================================================================

describe('Type mapping', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE types (v)');
  });

  afterEach(() => {
    db.close();
  });

  it('string round-trip', () => {
    db.run('INSERT INTO types (v) VALUES (?)', ['hello']);
    const row = db.get('SELECT v FROM types') as Record<string, unknown>;
    expect(row.v).toBe('hello');
  });

  it('integer round-trip', () => {
    db.run('INSERT INTO types (v) VALUES (?)', [42]);
    const row = db.get('SELECT v FROM types') as Record<string, unknown>;
    expect(row.v).toBe(42);
  });

  it('float round-trip', () => {
    db.run('INSERT INTO types (v) VALUES (?)', [3.14]);
    const row = db.get('SELECT v FROM types') as Record<string, unknown>;
    expect(row.v).toBeCloseTo(3.14);
  });

  it('null round-trip', () => {
    db.run('INSERT INTO types (v) VALUES (?)', [null]);
    const row = db.get('SELECT v FROM types') as Record<string, unknown>;
    expect(row.v).toBeNull();
  });

  it('boolean true stored as integer 1', () => {
    db.run('INSERT INTO types (v) VALUES (?)', [true]);
    const row = db.get('SELECT v FROM types') as Record<string, unknown>;
    expect(row.v).toBe(1);
  });

  it('boolean false stored as integer 0', () => {
    db.run('INSERT INTO types (v) VALUES (?)', [false]);
    const row = db.get('SELECT v FROM types') as Record<string, unknown>;
    expect(row.v).toBe(0);
  });

  it('Number.MAX_SAFE_INTEGER round-trip', () => {
    const max = Number.MAX_SAFE_INTEGER;
    db.run('INSERT INTO types (v) VALUES (?)', [max]);
    const row = db.get('SELECT v FROM types') as Record<string, unknown>;
    expect(row.v).toBe(max);
  });
});

// ============================================================================
// Error handling
// ============================================================================

describe('Error handling', () => {
  it('includes SQLite error message', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER UNIQUE)');
    db.run('INSERT INTO t (id) VALUES (?)', [1]);

    expect(() => db.run('INSERT INTO t (id) VALUES (?)', [1])).toThrow(/UNIQUE/i);
    db.close();
  });

  it('invalid SQL in run throws', () => {
    const db = new Database(':memory:');
    expect(() => db.run('NOT SQL', [])).toThrow();
    db.close();
  });

  it('invalid SQL in get throws', () => {
    const db = new Database(':memory:');
    expect(() => db.get('NOT SQL', [])).toThrow();
    db.close();
  });

  it('invalid SQL in all throws', () => {
    const db = new Database(':memory:');
    expect(() => db.all('NOT SQL', [])).toThrow();
    db.close();
  });
});
