# SQLite Driver Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a thin driver adapter layer so `bun run server` uses `bun:sqlite` (no native ABI) while `bun run start` (Electron) continues using `better-sqlite3`.

**Architecture:** Define `ISqliteDriver` interface; implement `BetterSqlite3Driver` and `BunSqliteDriver`; add a dynamic-`import()` factory `createDriver()` that selects the correct driver at runtime via `process.versions.bun`; migrate `AionUIDatabase` from a sync constructor to a static async factory; update all call sites to `await getDatabase()`.

**Tech Stack:** TypeScript, better-sqlite3 (Electron path), bun:sqlite (server path), esbuild (build), Vitest 4 (unit tests for BetterSqlite3 driver), bun test (unit tests for BunSqliteDriver)

---

## Spec Reference

Full design spec: `docs/superpowers/specs/2026-03-20-sqlite-driver-abstraction-design.md`

---

## File Structure

### New files (create)

| Path                                                                       | Purpose                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| `src/process/services/database/drivers/ISqliteDriver.ts`                   | `IStatement` + `ISqliteDriver` interfaces      |
| `src/process/services/database/drivers/BetterSqlite3Driver.ts`             | Wraps better-sqlite3, implements ISqliteDriver |
| `src/process/services/database/drivers/BunSqliteDriver.ts`                 | Wraps bun:sqlite, implements ISqliteDriver     |
| `src/process/services/database/drivers/createDriver.ts`                    | Runtime-detection factory (dynamic import)     |
| `tests/unit/process/services/database/drivers/BetterSqlite3Driver.test.ts` | Vitest unit tests for BetterSqlite3Driver      |
| `src/process/services/database/drivers/BunSqliteDriver.bun.test.ts`        | bun-test unit tests for BunSqliteDriver        |

### Modified files

| Path                                             | Change                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `src/process/services/database/schema.ts`        | Param types `Database.Database` → `ISqliteDriver`; split 3 multi-statement `exec()` calls |
| `src/process/services/database/migrations.ts`    | All param types; split every multi-statement `exec()` (see Task 6 audit)                  |
| `src/process/services/database/index.ts`         | Static async factory; async `getDatabase()`; remove better-sqlite3 imports                |
| `src/process/channels/pairing/PairingService.ts` | `isUserAuthorized` sync → async                                                           |
| All 22 files that call `getDatabase()`           | Add `await`                                                                               |
| `scripts/build-server.mjs`                       | Remove `better-sqlite3` from `external`; add `bun:sqlite`                                 |
| `package.json`                                   | Server scripts use `bun`; add `test:bun` script                                           |

---

## Task 1: Create ISqliteDriver interface

**Files:**

- Create: `src/process/services/database/drivers/ISqliteDriver.ts`

- [ ] **Step 1: Create the interface file**

```typescript
// src/process/services/database/drivers/ISqliteDriver.ts

export interface IStatement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface ISqliteDriver {
  prepare(sql: string): IStatement;
  exec(sql: string): void;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
  close(): void;
}
```

- [ ] **Step 2: Verify type check passes**

```bash
cd /Users/zhangyaxiong/Workspace/src/github/iOfficeAI/AionUi-Bak
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/process/services/database/drivers/ISqliteDriver.ts
git commit -m "feat(database): add ISqliteDriver interface"
```

---

## Task 2: Implement BetterSqlite3Driver + Vitest tests

**Files:**

- Create: `src/process/services/database/drivers/BetterSqlite3Driver.ts`
- Create: `tests/unit/process/services/database/drivers/BetterSqlite3Driver.test.ts`

- [ ] **Step 1: Create the driver**

```typescript
// src/process/services/database/drivers/BetterSqlite3Driver.ts

import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import type { ISqliteDriver, IStatement } from './ISqliteDriver';

class BetterSqlite3Statement implements IStatement {
  constructor(private stmt: Database.Statement) {}

  get(...args: unknown[]): unknown {
    return this.stmt.get(...args);
  }

  all(...args: unknown[]): unknown[] {
    return this.stmt.all(...args) as unknown[];
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.stmt.run(...args);
  }
}

export class BetterSqlite3Driver implements ISqliteDriver {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
  }

  prepare(sql: string): IStatement {
    return new BetterSqlite3Statement(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    return this.db.pragma(sql, options);
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/process/services/database/drivers/BetterSqlite3Driver.test.ts

import { describe, it, expect, afterEach } from 'vitest';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';

describe('BetterSqlite3Driver', () => {
  let driver: BetterSqlite3Driver;

  afterEach(() => {
    driver?.close();
  });

  it('exec and prepare().get() roundtrip', () => {
    driver = new BetterSqlite3Driver(':memory:');
    driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    driver.prepare('INSERT INTO t (val) VALUES (?)').run('hello');
    const row = driver.prepare('SELECT val FROM t WHERE id = 1').get() as { val: string };
    expect(row.val).toBe('hello');
  });

  it('prepare().all() returns array', () => {
    driver = new BetterSqlite3Driver(':memory:');
    driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    driver.prepare('INSERT INTO t (val) VALUES (?)').run('a');
    driver.prepare('INSERT INTO t (val) VALUES (?)').run('b');
    const rows = driver.prepare('SELECT val FROM t ORDER BY id').all() as Array<{ val: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].val).toBe('a');
    expect(rows[1].val).toBe('b');
  });

  it('prepare().run() returns changes and lastInsertRowid', () => {
    driver = new BetterSqlite3Driver(':memory:');
    driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    const result = driver.prepare('INSERT INTO t (val) VALUES (?)').run('x');
    expect(result.changes).toBe(1);
    expect(Number(result.lastInsertRowid)).toBe(1);
  });

  it('pragma() getter returns value', () => {
    driver = new BetterSqlite3Driver(':memory:');
    const mode = driver.pragma('journal_mode', { simple: true });
    expect(typeof mode).toBe('string');
  });

  it('pragma() setter does not throw', () => {
    driver = new BetterSqlite3Driver(':memory:');
    expect(() => driver.pragma('foreign_keys = ON')).not.toThrow();
  });

  it('transaction() wraps function', () => {
    driver = new BetterSqlite3Driver(':memory:');
    driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    const insert = driver.transaction((val: unknown) => {
      driver.prepare('INSERT INTO t (val) VALUES (?)').run(val);
    });
    insert('wrapped');
    const row = driver.prepare('SELECT val FROM t').get() as { val: string };
    expect(row.val).toBe('wrapped');
  });

  it('foreign_key_check pragma returns array', () => {
    driver = new BetterSqlite3Driver(':memory:');
    const violations = driver.pragma('foreign_key_check') as unknown[];
    expect(Array.isArray(violations)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

```bash
bun run test -- --reporter=verbose tests/unit/process/services/database/drivers/BetterSqlite3Driver.test.ts
```

Expected: FAIL (BetterSqlite3Driver not found)

- [ ] **Step 4: Run test — verify it passes**

```bash
bun run test -- --reporter=verbose tests/unit/process/services/database/drivers/BetterSqlite3Driver.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Type check**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/process/services/database/drivers/BetterSqlite3Driver.ts \
        tests/unit/process/services/database/drivers/BetterSqlite3Driver.test.ts
git commit -m "feat(database): implement BetterSqlite3Driver with unit tests"
```

---

## Task 3: Implement BunSqliteDriver + bun tests

**Files:**

- Create: `src/process/services/database/drivers/BunSqliteDriver.ts`
- Create: `src/process/services/database/drivers/BunSqliteDriver.bun.test.ts`

> **⚠️ IMPORTANT:** BunSqliteDriver tests MUST run under `bun test`, NOT Vitest. The `bun:sqlite` module is unavailable in Node.js/Vitest. Test file lives in `src/` (not `tests/`) so Vitest skips it automatically.

- [ ] **Step 1: Create the driver**

```typescript
// src/process/services/database/drivers/BunSqliteDriver.ts
// bun:sqlite is a Bun built-in — this file must only be loaded when running under Bun.

import { Database } from 'bun:sqlite';
import type { ISqliteDriver, IStatement } from './ISqliteDriver';

class BunStatement implements IStatement {
  constructor(
    private db: Database,
    private sql: string
  ) {}

  get(...args: unknown[]): unknown {
    return this.db.query(this.sql).get(...args);
  }

  all(...args: unknown[]): unknown[] {
    return this.db.query(this.sql).all(...args) as unknown[];
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    // bun:sqlite db.query(...).run() returns void.
    // Use db.run() (top-level Database method) which returns { changes, lastInsertRowid }.
    return this.db.run(this.sql, ...args);
  }
}

export class BunSqliteDriver implements ISqliteDriver {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  prepare(sql: string): IStatement {
    return new BunStatement(this.db, sql);
  }

  exec(sql: string): void {
    // bun:sqlite db.run() does not support multi-statement strings.
    // Callers must pass single statements only.
    this.db.run(sql);
  }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    // Setter pragma: contains '=' (e.g. 'foreign_keys = ON')
    if (sql.includes('=')) {
      this.db.run(`PRAGMA ${sql}`);
      return undefined;
    }
    // Getter pragma with { simple: true }: return scalar value
    if (options?.simple) {
      const row = this.db.query(`PRAGMA ${sql}`).get() as Record<string, unknown> | null;
      if (!row) return undefined;
      return Object.values(row)[0];
    }
    // Getter pragma (default): return all rows as array
    return this.db.query(`PRAGMA ${sql}`).all();
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 2: Write the failing bun test**

```typescript
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
```

- [ ] **Step 3: Run bun test — verify it fails (driver not found)**

```bash
bun test src/process/services/database/drivers/BunSqliteDriver.bun.test.ts
```

Expected: FAIL (BunSqliteDriver not found or import error)

- [ ] **Step 4: Run bun test — verify it passes**

```bash
bun test src/process/services/database/drivers/BunSqliteDriver.bun.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Verify Vitest does NOT pick up the bun test**

```bash
bun run test -- --reporter=verbose 2>&1 | grep -i "bun.test"
```

Expected: no output (Vitest skips `src/**` files because its include pattern is `tests/unit/**`)

- [ ] **Step 6: Commit**

```bash
git add src/process/services/database/drivers/BunSqliteDriver.ts \
        src/process/services/database/drivers/BunSqliteDriver.bun.test.ts
git commit -m "feat(database): implement BunSqliteDriver with bun:test unit tests"
```

---

## Task 4: Create createDriver factory

**Files:**

- Create: `src/process/services/database/drivers/createDriver.ts`

- [ ] **Step 1: Create the factory**

```typescript
// src/process/services/database/drivers/createDriver.ts

import type { ISqliteDriver } from './ISqliteDriver';

export async function createDriver(dbPath: string): Promise<ISqliteDriver> {
  if (typeof process.versions['bun'] !== 'undefined') {
    const { BunSqliteDriver } = await import('./BunSqliteDriver');
    return new BunSqliteDriver(dbPath);
  }
  const { BetterSqlite3Driver } = await import('./BetterSqlite3Driver');
  return new BetterSqlite3Driver(dbPath);
}
```

- [ ] **Step 2: Type check**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/process/services/database/drivers/createDriver.ts
git commit -m "feat(database): add createDriver factory with runtime detection"
```

---

## Task 5: Update schema.ts

**Files:**

- Modify: `src/process/services/database/schema.ts`

**Changes needed:**

1. Replace `import type Database from 'better-sqlite3'` with `import type { ISqliteDriver } from './drivers/ISqliteDriver'`
2. Change all function signatures: `db: Database.Database` → `db: ISqliteDriver`
3. Split 3 multi-statement `exec()` calls (lines ~24, ~42, ~63)

- [ ] **Step 1: Update imports and signatures**

Replace the import at the top:

```typescript
// REMOVE:
import type Database from 'better-sqlite3';

// ADD:
import type { ISqliteDriver } from './drivers/ISqliteDriver';
```

Change all three function signatures:

```typescript
// Line 12: was (db: Database.Database)
export function initSchema(db: ISqliteDriver): void;

// Line 90: was (db: Database.Database)
export function getDatabaseVersion(db: ISqliteDriver): number;

// Line 103: was (db: Database.Database)
export function setDatabaseVersion(db: ISqliteDriver, version: number): void;
```

- [ ] **Step 2: Split multi-statement exec() in users table block (was ~line 24)**

```typescript
// BEFORE (single exec with 3 statements):
db.exec(`
  CREATE TABLE IF NOT EXISTS users ( ... );
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

// AFTER (one exec per statement):
db.exec(`CREATE TABLE IF NOT EXISTS users (
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
db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
```

- [ ] **Step 3: Split multi-statement exec() in conversations table block (was ~line 42)**

Split into 6 separate `exec()` calls: 1 CREATE TABLE + 4 CREATE INDEX + 1 CREATE INDEX (user_updated).

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot')),
  extra TEXT NOT NULL,
  model TEXT,
  status TEXT CHECK(status IN ('pending', 'running', 'finished')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
```

- [ ] **Step 4: Split multi-statement exec() in messages table block (was ~line 63)**

Split into 7 separate `exec()` calls: 1 CREATE TABLE + 5 CREATE INDEX + 1 CREATE INDEX (conversation_created).

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  msg_id TEXT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  position TEXT CHECK(position IN ('left', 'right', 'center', 'pop')),
  status TEXT CHECK(status IN ('finish', 'pending', 'error', 'work')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)');
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at)');
```

- [ ] **Step 5: Type check**

```bash
bunx tsc --noEmit
```

Expected: no errors in schema.ts (index.ts and migrations.ts will still have errors — that's OK)

- [ ] **Step 6: Commit**

```bash
git add src/process/services/database/schema.ts
git commit -m "refactor(database): update schema.ts to use ISqliteDriver, split multi-statement exec()"
```

---

## Task 6: Update migrations.ts

**Files:**

- Modify: `src/process/services/database/migrations.ts`

**This is the largest task.** It has two parts:

1. Update all type signatures (`Database.Database` → `ISqliteDriver`)
2. Split ALL multi-statement `exec()` calls

### Part A: Update type signatures

- [ ] **Step 1: Replace import**

```typescript
// REMOVE:
import type Database from 'better-sqlite3';

// ADD:
import type { ISqliteDriver } from './drivers/ISqliteDriver';
```

- [ ] **Step 2: Update IMigration interface**

```typescript
// BEFORE:
export interface IMigration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

// AFTER:
export interface IMigration {
  version: number;
  name: string;
  up: (db: ISqliteDriver) => void;
  down: (db: ISqliteDriver) => void;
}
```

- [ ] **Step 3: Update all top-level function signatures**

```typescript
// All four functions in the file footer:
export function runMigrations(db: ISqliteDriver, fromVersion: number, toVersion: number): void
export function rollbackMigrations(db: ISqliteDriver, fromVersion: number, toVersion: number): void
export function getMigrationHistory(db: ISqliteDriver): Array<...>
export function isMigrationApplied(db: ISqliteDriver, version: number): boolean
```

### Part B: Split multi-statement exec() calls

**Pattern:** Every `db.exec(\`...\`)`that contains multiple semicolon-separated SQL statements must become multiple individual`db.exec(...)` calls, one per statement.

**How to identify:** Look for `db.exec(` where the template literal contains more than one `;`. A statement ends at `;`. Empty lines and comments (`--`) between statements are fine to drop.

**Complete audit — all migrations needing splits:**

#### migration_v1.down — 3 statements → 3 exec() calls

```typescript
// BEFORE:
db.exec(`
  DROP TABLE IF EXISTS messages;
  DROP TABLE IF EXISTS conversations;
  DROP TABLE IF EXISTS users;
`);

// AFTER:
db.exec('DROP TABLE IF EXISTS messages');
db.exec('DROP TABLE IF EXISTS conversations');
db.exec('DROP TABLE IF EXISTS users');
```

#### migration_v2.up — 3 statements → 3 exec() calls

```typescript
// BEFORE: one exec() with 3 CREATE INDEX statements
// AFTER:
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc ON messages(conversation_id, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_type_created ON messages(type, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_type ON conversations(user_id, type)');
```

#### migration_v2.down — 3 statements → 3 exec() calls

```typescript
db.exec('DROP INDEX IF EXISTS idx_messages_conv_created_desc');
db.exec('DROP INDEX IF EXISTS idx_messages_type_created');
db.exec('DROP INDEX IF EXISTS idx_conversations_user_type');
```

#### migration_v3.down — 1 statement (OK, no change needed)

#### migration_v5.up — 1 statement (OK, no change needed)

#### migration_v6.down — 5 statements → 5 exec() calls

```typescript
db.exec(
  `CREATE TABLE users_backup AS SELECT id, username, email, password_hash, avatar_path, created_at, updated_at, last_login FROM users`
);
db.exec('DROP TABLE users');
db.exec('ALTER TABLE users_backup RENAME TO users');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
```

#### migration_v7.up — 4 exec() blocks, each multi-statement

Block 1 (assistant_plugins): CREATE TABLE + 2 CREATE INDEX → 3 exec()

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS assistant_plugins (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord')),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL,
  status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
  last_connected INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type)');
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled)');
```

Block 2 (assistant_users): CREATE TABLE + 1 CREATE INDEX → 2 exec()

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS assistant_users (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  platform_type TEXT NOT NULL,
  display_name TEXT,
  authorized_at INTEGER NOT NULL,
  last_active INTEGER,
  session_id TEXT,
  UNIQUE(platform_user_id, platform_type)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_users_platform ON assistant_users(platform_type, platform_user_id)');
```

Block 3 (assistant_sessions): CREATE TABLE + 2 CREATE INDEX → 3 exec()

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS assistant_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_type TEXT NOT NULL CHECK(agent_type IN ('gemini', 'acp', 'codex')),
  conversation_id TEXT,
  workspace TEXT,
  created_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES assistant_users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user ON assistant_sessions(user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_sessions_conversation ON assistant_sessions(conversation_id)');
```

Block 4 (assistant_pairing_codes): CREATE TABLE + 2 CREATE INDEX → 3 exec()

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS assistant_pairing_codes (
  code TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  platform_type TEXT NOT NULL,
  display_name TEXT,
  requested_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'expired'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_pairing_expires ON assistant_pairing_codes(expires_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_pairing_status ON assistant_pairing_codes(status)');
```

#### migration_v7.down — 4 statements → 4 exec() calls

```typescript
db.exec('DROP TABLE IF EXISTS assistant_pairing_codes');
db.exec('DROP TABLE IF EXISTS assistant_sessions');
db.exec('DROP TABLE IF EXISTS assistant_users');
db.exec('DROP TABLE IF EXISTS assistant_plugins');
```

#### migration_v8.up

- First exec(): `ALTER TABLE conversations ADD COLUMN source ...` — single statement, OK
- Second exec(): 2 CREATE INDEX → 2 exec()

```typescript
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');
```

#### migration_v8.down — 2 statements → 2 exec() calls

```typescript
db.exec('DROP INDEX IF EXISTS idx_conversations_source');
db.exec('DROP INDEX IF EXISTS idx_conversations_source_updated');
```

#### migration_v9.up — 4 statements → 4 exec() calls

The large CREATE TABLE block is a single statement (no `;` inside). Split at the 3 CREATE INDEX lines:

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  schedule_kind TEXT NOT NULL,
  schedule_value TEXT NOT NULL,
  schedule_tz TEXT,
  schedule_description TEXT NOT NULL,
  payload_message TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  conversation_title TEXT,
  agent_type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,
  last_error TEXT,
  run_count INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_cron_jobs_conversation ON cron_jobs(conversation_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at) WHERE enabled = 1');
db.exec('CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent_type ON cron_jobs(agent_type)');
```

#### migration_v9.down — 4 statements → 4 exec() calls

```typescript
db.exec('DROP INDEX IF EXISTS idx_cron_jobs_agent_type');
db.exec('DROP INDEX IF EXISTS idx_cron_jobs_next_run');
db.exec('DROP INDEX IF EXISTS idx_cron_jobs_conversation');
db.exec('DROP TABLE IF EXISTS cron_jobs');
```

#### migration_v10.up — 6 statements → 6 exec() calls

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS assistant_plugins_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord', 'lark')),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL,
  status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
  last_connected INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
db.exec('INSERT OR IGNORE INTO assistant_plugins_new SELECT * FROM assistant_plugins');
db.exec('DROP TABLE IF EXISTS assistant_plugins');
db.exec('ALTER TABLE assistant_plugins_new RENAME TO assistant_plugins');
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type)');
db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled)');
```

#### migration_v10.down — 6 statements → 6 exec() calls

Same pattern as v10.up but with the rollback table name and constraint.

#### migration_v11.up

- First exec(): `UPDATE conversations SET source = NULL WHERE ...` — single statement, OK
- Second exec(): multi-statement (CREATE TABLE + INSERT + DROP + ALTER + 6 CREATE INDEX) → 10 exec()

```typescript
// After the UPDATE exec():
db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway')),
  extra TEXT NOT NULL,
  model TEXT,
  status TEXT CHECK(status IN ('pending', 'running', 'finished')),
  source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);
db.exec(
  'INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, created_at, updated_at) SELECT id, user_id, name, type, extra, model, status, source, created_at, updated_at FROM conversations'
);
db.exec('DROP TABLE conversations');
db.exec('ALTER TABLE conversations_new RENAME TO conversations');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');
```

#### migration_v11.down — same pattern as v11.up's second block

#### migration_v12.up

- First exec(): `UPDATE conversations SET source = NULL WHERE ...` — single statement, OK
- Second exec(): same pattern as v11.up second block → 10 exec()

#### migration_v12.down

- First exec(): `UPDATE conversations SET source = NULL WHERE source = 'lark'` — single statement, OK
- Second exec(): same pattern → 10 exec()

#### migration_v13.up — single large exec() → 10 exec() calls (same conversation table recreation pattern)

#### migration_v13.down

- First exec(): `DELETE FROM conversations WHERE type = 'nanobot'` — single statement, OK
- Second exec(): same pattern → 10 exec()

#### migration_v14.up

- First exec(): assistant_plugins_new recreation (CREATE TABLE + INSERT + DROP + ALTER + 2 INDEX) → 6 exec()
- Second exec(): `UPDATE conversations SET source = NULL WHERE ...` — single statement, OK
- Third exec(): conversations_new recreation (CREATE TABLE + INSERT + DROP + ALTER + 7 INDEX) → 11 exec()
- The `ALTER TABLE assistant_sessions ADD COLUMN chat_id TEXT` inside the if-block is a single statement, OK

#### migration_v14.down

- First exec(): `DELETE FROM assistant_plugins WHERE type = 'dingtalk'` — single statement, OK
- Second exec(): assistant_plugins_old recreation → 6 exec()
- Third exec(): `UPDATE conversations SET source = NULL WHERE source = 'dingtalk'` — single statement, OK
- Fourth exec(): conversations_rollback recreation → 10 exec()

#### migration_v15.up

- First exec(): assistant_plugins_new recreation (without CHECK constraint) → 6 exec()
- Second exec(): conversations_new recreation → 11 exec()

#### migration_v15.down — no exec() calls (only console.warn)

- [ ] **Step 4: Verify no multi-statement exec() remains**

```bash
grep -n 'db\.exec' src/process/services/database/migrations.ts | wc -l
```

After splitting, every `db.exec()` should contain a single SQL statement. Manually review any that look long.

- [ ] **Step 5: Type check**

```bash
bunx tsc --noEmit
```

Expected: remaining errors only in `index.ts` (not yet updated)

- [ ] **Step 6: Run existing tests**

```bash
bun run test
```

Expected: all existing tests pass (no database tests exist yet — this is baseline)

- [ ] **Step 7: Commit**

```bash
git add src/process/services/database/migrations.ts
git commit -m "refactor(database): update migrations.ts to use ISqliteDriver, split all multi-statement exec()"
```

---

## Task 7: Refactor index.ts (static async factory)

**Files:**

- Modify: `src/process/services/database/index.ts`

**Changes:**

1. Remove `import BetterSqlite3` and `import type Database`
2. Add `import type { ISqliteDriver } from './drivers/ISqliteDriver'` and `import { createDriver } from './drivers/createDriver'`
3. `private db: Database.Database` → `private db: ISqliteDriver`
4. Remove constructor body (no more sync initialization); add private constructor
5. Add `static async create(dbPath: string)` factory method
6. Change `getDatabase()` to return `Promise<AionUIDatabase>`

- [ ] **Step 1: Update imports at top of file**

```typescript
// REMOVE these two lines:
import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';

// ADD:
import type { ISqliteDriver } from './drivers/ISqliteDriver';
import { createDriver } from './drivers/createDriver';
```

- [ ] **Step 2: Refactor AionUIDatabase class**

Replace the constructor and add static factory. Keep all SQL methods unchanged — only the class-level wiring changes.

```typescript
export class AionUIDatabase {
  private db: ISqliteDriver;
  private readonly defaultUserId = 'system_default_user';
  private readonly systemPasswordPlaceholder = '';

  // Private constructor — use AionUIDatabase.create() instead
  private constructor(db: ISqliteDriver) {
    this.db = db;
  }

  static async create(dbPath: string): Promise<AionUIDatabase> {
    const driver = await createDriver(dbPath);
    const instance = new AionUIDatabase(driver);
    instance.initialize();
    return instance;
  }

  private initialize(): void {
    try {
      initSchema(this.db);
      const currentVersion = getDatabaseVersion(this.db);
      if (currentVersion < CURRENT_DB_VERSION) {
        this.runMigrations(currentVersion, CURRENT_DB_VERSION);
        setDatabaseVersion(this.db, CURRENT_DB_VERSION);
      }
      this.ensureSystemUser();
    } catch (error) {
      console.error('[Database] Initialization failed:', error);
      throw error;
    }
  }

  // ... all other methods unchanged ...
}
```

- [ ] **Step 3: Replace module-level singleton and getDatabase()**

```typescript
// REMOVE old synchronous implementation:
// let dbInstance: AionUIDatabase | null = null;
// export function getDatabase(): AionUIDatabase { ... }

// ADD async lazy initialization:
let dbInstancePromise: Promise<AionUIDatabase> | null = null;

function resolveDbPath(): string {
  return path.join(getDataPath(), 'aionui.db');
}

export function getDatabase(): Promise<AionUIDatabase> {
  if (!dbInstancePromise) {
    dbInstancePromise = AionUIDatabase.create(resolveDbPath());
  }
  return dbInstancePromise;
}

export function closeDatabase(): void {
  if (dbInstancePromise) {
    // Best-effort close: ignore errors during shutdown
    dbInstancePromise.then((db) => db.close()).catch(() => {});
    dbInstancePromise = null;
  }
}
```

- [ ] **Step 4: Remove the DB corruption recovery block**

The corruption recovery logic in the old constructor used `new BetterSqlite3()` and `fs.renameSync`. Since the constructor is now private and path-agnostic, this logic moves into the static `create()` method:

```typescript
static async create(dbPath: string): Promise<AionUIDatabase> {
  const dir = path.dirname(dbPath);
  ensureDirectory(dir);

  // Attempt normal initialization
  try {
    const driver = await createDriver(dbPath);
    const instance = new AionUIDatabase(driver);
    instance.initialize();
    return instance;
  } catch (error) {
    console.error('[Database] Failed to initialize, attempting recovery...', error);
  }

  // Recovery: backup corrupted file and start fresh
  if (fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.backup.${Date.now()}`;
    try {
      fs.renameSync(dbPath, backupPath);
      console.log(`[Database] Backed up corrupted database to: ${backupPath}`);
    } catch {
      try {
        fs.unlinkSync(dbPath);
        console.log('[Database] Deleted corrupted database file');
      } catch (e2) {
        throw new Error('Database is corrupted and cannot be recovered. Please manually delete: ' + dbPath, { cause: e2 });
      }
    }
  }

  // Retry with fresh file
  const driver = await createDriver(dbPath);
  const instance = new AionUIDatabase(driver);
  instance.initialize();
  return instance;
}
```

- [ ] **Step 5: Type check**

```bash
bunx tsc --noEmit
```

Expected: errors in the 22 call-site files (they still call `getDatabase()` without await) — that's expected at this stage

- [ ] **Step 6: Commit**

```bash
git add src/process/services/database/index.ts
git commit -m "refactor(database): migrate AionUIDatabase to static async factory, async getDatabase()"
```

---

## Task 8: Update all 22 call sites

**Files to update** (from the grep audit):

1. `src/process/utils/initStorage.ts`
2. `src/process/utils/tray.ts`
3. `src/process/webserver/routes/apiRoutes.ts`
4. `src/process/webserver/auth/repository/UserRepository.ts`
5. `src/process/utils/message.ts`
6. `src/process/task/OpenClawAgentManager.ts`
7. `src/process/task/GeminiAgentManager.ts`
8. `src/process/task/AcpAgentManager.ts`
9. `src/process/task/CodexAgentManager.ts`
10. `src/process/services/database/SqliteChannelRepository.ts`
11. `src/process/services/database/SqliteConversationRepository.ts`
12. `src/process/services/database/StreamingMessageBuffer.ts`
13. `src/process/services/cron/CronStore.ts`
14. `src/process/channels/core/ChannelManager.ts`
15. `src/process/channels/core/SessionManager.ts`
16. `src/process/channels/gateway/ActionExecutor.ts`
17. `src/process/channels/gateway/PluginManager.ts`
18. `src/process/channels/pairing/PairingService.ts`
19. `src/process/channels/agent/ChannelMessageService.ts`
20. `src/process/bridge/migrationUtils.ts`
21. `src/process/services/database/index.ts` (already handled in Task 7)
22. `src/process/services/database/README.md` (doc file — no code change needed)

**How to find every occurrence:**

```bash
grep -rn 'getDatabase()' src/ --include="*.ts"
```

- [ ] **Step 1: Mechanical `await` addition in async contexts**

For each file, find `const db = getDatabase()` or `getDatabase()` and add `await`:

```typescript
// BEFORE:
const db = getDatabase();

// AFTER:
const db = await getDatabase();
```

If the containing function is already `async`, this is a one-word change. Verify with `bunx tsc --noEmit` after each file or do all files then check.

- [ ] **Step 2: Handle sync context in initStorage.ts**

`cleanupOrphanedHealthCheckConversations` (line ~889) is synchronous and calls `getDatabase()`. Make it async:

```typescript
// BEFORE:
const cleanupOrphanedHealthCheckConversations = () => {
  try {
    const db = getDatabase();
    ...

// AFTER:
const cleanupOrphanedHealthCheckConversations = async () => {
  try {
    const db = await getDatabase();
    ...
```

Then in `initStorage()` (line ~1117), update the call:

```typescript
// BEFORE:
getDatabase();
cleanupOrphanedHealthCheckConversations();

// AFTER:
await getDatabase(); // eagerly initialize (warm up the singleton)
await cleanupOrphanedHealthCheckConversations();
```

- [ ] **Step 3: Make PairingService.isUserAuthorized async**

`src/process/channels/pairing/PairingService.ts` line ~123:

```typescript
// BEFORE:
isUserAuthorized(platformUserId: string, platformType: PluginType): boolean {
  const db = getDatabase();
  const result = db.getChannelUserByPlatform(platformUserId, platformType);
  return result.success && result.data !== null;
}

// AFTER:
async isUserAuthorized(platformUserId: string, platformType: PluginType): Promise<boolean> {
  const db = await getDatabase();
  const result = db.getChannelUserByPlatform(platformUserId, platformType);
  return result.success && result.data !== null;
}
```

- [ ] **Step 4: Update ActionExecutor.ts to await isUserAuthorized**

`src/process/channels/gateway/ActionExecutor.ts` line ~342 (inside `private async executeAction()`):

```typescript
// BEFORE:
const isAuthorized = this.pairingService.isUserAuthorized(user.id, platform);

// AFTER:
const isAuthorized = await this.pairingService.isUserAuthorized(user.id, platform);
```

- [ ] **Step 5: Run type check — fix all remaining errors**

```bash
bunx tsc --noEmit
```

Expected: 0 errors. If there are errors, they will be in call sites where `getDatabase()` is used in a sync context or the return type is used as `AionUIDatabase` instead of `Promise<AionUIDatabase>`. Fix each one by adding `await` and making the enclosing function `async`.

- [ ] **Step 6: Run lint**

```bash
bun run lint:fix
```

- [ ] **Step 7: Run all tests**

```bash
bun run test
```

Expected: all existing tests pass

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(database): update all getDatabase() call sites to async/await"
```

---

## Task 9: Build config + package.json + smoke test

**Files:**

- Modify: `scripts/build-server.mjs`
- Modify: `package.json`

- [ ] **Step 1: Update build-server.mjs**

```javascript
// BEFORE:
external: ['better-sqlite3', 'keytar', 'node-pty'],

// AFTER:
external: ['bun:sqlite', 'keytar', 'node-pty'],
```

> `better-sqlite3` is removed from externals — with dynamic `import()` in `createDriver.ts`, esbuild's tree-shaking excludes `BetterSqlite3Driver` from the server bundle automatically (the Bun branch is always taken).
>
> `bun:sqlite` MUST be in `external` — esbuild does not know it is a built-in and will error otherwise.

- [ ] **Step 2: Update package.json server scripts**

```json
// BEFORE:
"server":             "node scripts/build-server.mjs && cross-env NODE_ENV=development node dist-server/server.mjs",
"server:remote":      "node scripts/build-server.mjs && cross-env NODE_ENV=development ALLOW_REMOTE=true node dist-server/server.mjs",
"server:prod":        "node scripts/build-server.mjs && cross-env NODE_ENV=production node dist-server/server.mjs",
"server:prod:remote": "node scripts/build-server.mjs && cross-env NODE_ENV=production ALLOW_REMOTE=true node dist-server/server.mjs",

// AFTER (build step stays node; run step uses bun):
"server":             "node scripts/build-server.mjs && cross-env NODE_ENV=development bun dist-server/server.mjs",
"server:remote":      "node scripts/build-server.mjs && cross-env NODE_ENV=development ALLOW_REMOTE=true bun dist-server/server.mjs",
"server:prod":        "node scripts/build-server.mjs && cross-env NODE_ENV=production bun dist-server/server.mjs",
"server:prod:remote": "node scripts/build-server.mjs && cross-env NODE_ENV=production ALLOW_REMOTE=true bun dist-server/server.mjs",
```

- [ ] **Step 3: Add test:bun script to package.json**

```json
"test:bun": "bun test src/process/services/database/drivers/*.bun.test.ts"
```

- [ ] **Step 4: Build the server**

```bash
node scripts/build-server.mjs
```

Expected: output like `dist-server/server.mjs` with no errors. Verify `bun:sqlite` does NOT appear in the bundle output warnings.

- [ ] **Step 5: Smoke test**

```bash
bun run server
```

Expected:

- Server starts without ABI errors
- `[Database] Initializing database at: ...` log appears
- Server listens on expected port (no crash)
- Send Ctrl+C to stop

- [ ] **Step 6: Run bun driver tests**

```bash
bun run test:bun
```

Expected: all BunSqliteDriver tests PASS

- [ ] **Step 7: Run all Vitest tests**

```bash
bun run test
```

Expected: all existing tests pass

- [ ] **Step 8: Commit**

```bash
git add scripts/build-server.mjs package.json
git commit -m "feat(server): switch server runtime to bun, use bun:sqlite driver"
```

---

## Final Verification Checklist

Before claiming complete:

- [ ] `bunx tsc --noEmit` — 0 errors
- [ ] `bun run lint:fix` — 0 lint errors
- [ ] `bun run test` — all Vitest tests pass
- [ ] `bun run test:bun` — all BunSqliteDriver bun tests pass
- [ ] `bun run server` — server starts without ABI or import errors
- [ ] No `console.log` left in changed files (CI hook checks this)
- [ ] `getDatabase()` returns `Promise<AionUIDatabase>` everywhere in the codebase
- [ ] No `better-sqlite3` import remains in `index.ts`
- [ ] No multi-statement `db.exec()` remains in `schema.ts` or `migrations.ts`

---

## Common Pitfalls

| Pitfall                                                                                 | Fix                                                                                                                                           |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun:sqlite db.query(sql).run(args)` returns `void`, not `{ changes, lastInsertRowid }` | Always use `db.run(sql, ...args)` (top-level Database method) in `BunStatement.run()`                                                         |
| `db.exec()` with semicolons in SQL string literals                                      | Only applies to future migrations — for the current codebase there are no `;` in string literals                                              |
| `closeDatabase()` called before `getDatabase()` awaited                                 | The new `closeDatabase()` does a promise-based close; callers must handle it being async internally                                           |
| TypeScript `type` vs `interface` for `IMigration`                                       | Keep as `interface` (unchanged from original) — project convention uses `type` for simple shapes but interfaces for callable members          |
| `db.pragma()` in bun when sql contains `=`                                              | The `BunSqliteDriver.pragma()` uses `sql.includes('=')` to detect setter — valid for current usage (`foreign_keys = OFF`, `user_version = N`) |
