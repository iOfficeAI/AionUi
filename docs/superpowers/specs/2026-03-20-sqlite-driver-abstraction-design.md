# SQLite Driver Abstraction Layer

**Date:** 2026-03-20
**Status:** Approved

## Problem

`better-sqlite3` is a native Node.js addon compiled against a specific Node.js ABI. Electron embeds its own Node.js fork (ABI 136), while the standalone server runs on system Node.js 22 (ABI 127). These ABIs are permanently incompatible — no single `better-sqlite3` binary can serve both runtimes.

## Goal

Allow `bun run server` to use `bun:sqlite` (no native ABI dependency) while `bun run start` (Electron) continues using `better-sqlite3`. The change must be transparent to all business logic in `AionUIDatabase`.

## Solution: Thin Driver Adapter (Approach A)

Introduce a `drivers/` sub-directory under `src/process/services/database/` containing a driver interface, two implementations, and a factory. All files that currently accept `Database.Database` directly (`index.ts`, `schema.ts`, `migrations.ts`) are updated to accept `ISqliteDriver` instead.

## File Structure

```
src/process/services/database/
├── drivers/
│   ├── ISqliteDriver.ts        # Driver interface
│   ├── BetterSqlite3Driver.ts  # Wraps better-sqlite3 (Electron)
│   ├── BunSqliteDriver.ts      # Wraps bun:sqlite (server mode)
│   └── createDriver.ts         # Runtime-detection factory
├── index.ts                    # AionUIDatabase — minimal changes
├── schema.ts                   # Update param type to ISqliteDriver
├── migrations.ts               # Update param type to ISqliteDriver
└── ... (all other files unchanged)
```

## Interface (`ISqliteDriver.ts`)

```typescript
export interface IStatement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  // run() returns void in bun:sqlite; the driver wrapper uses db.run(sql, ...args)
  // on the Database instance to obtain { changes, lastInsertRowid }
  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface ISqliteDriver {
  prepare(sql: string): IStatement;
  // exec() must accept single statements only — bun:sqlite does not support
  // multi-statement strings. Callers must split compound DDL into separate exec() calls.
  exec(sql: string): void;
  // pragma() wraps better-sqlite3's db.pragma() and translates to bun:sqlite equivalents.
  // Setter pragmas (containing '=', e.g. 'foreign_keys = OFF') use db.run() in bun.
  // Getter pragmas without { simple } return all rows via .all() (covers multi-row results
  // like 'foreign_key_check'). { simple: true } returns the scalar value of the first row.
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  // transaction() has the same call pattern on both drivers:
  // returns a function that, when called, wraps fn() in a transaction.
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
  close(): void;
}
```

## API Compatibility Notes

| Feature                             | `better-sqlite3`               | `bun:sqlite`          | Adapter strategy                                                                                              |
| ----------------------------------- | ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `db.prepare(sql).get()`             | sync scalar/object             | sync scalar/object    | identical                                                                                                     |
| `db.prepare(sql).all()`             | sync array                     | sync array            | identical                                                                                                     |
| `db.prepare(sql).run()`             | `{ changes, lastInsertRowid }` | `void`                | Bun driver uses `db.run(sql, ...args)` on the Database instance, which returns `{ changes, lastInsertRowid }` |
| `db.exec(sql)`                      | multi-statement OK             | single statement only | callers split compound DDL                                                                                    |
| `db.pragma(name)`                   | returns array of rows          | no equivalent         | Bun driver: `db.query('PRAGMA '+name).all()`                                                                  |
| `db.pragma(name, { simple: true })` | returns scalar                 | no equivalent         | Bun driver: `db.query('PRAGMA '+name).get()`, extract `.value`                                                |
| `db.pragma('key = val')`            | setter, returns `[]`           | no equivalent         | Bun driver: detects `=` in sql string, uses `db.run('PRAGMA '+sql)`                                           |
| `db.transaction(fn)`                | returns wrapped fn             | same pattern          | identical                                                                                                     |
| `db.close()`                        | yes                            | yes                   | identical                                                                                                     |

### `pragma()` Bun Implementation Rules

The Bun driver `pragma()` must distinguish three cases:

1. **Setter pragma** (sql contains `=`, e.g. `'foreign_keys = OFF'`): use `db.run('PRAGMA ' + sql)` — returns `void`/`undefined`
2. **Getter pragma with `{ simple: true }`** (e.g. `'journal_mode'`): use `db.query('PRAGMA ' + sql).get()`, then extract the first property value as the scalar
3. **Getter pragma without options** (e.g. `'foreign_key_check'`): use `db.query('PRAGMA ' + sql).all()` — returns array (may have zero or more rows)

This covers all pragma usages in `migrations.ts`:

- `db.pragma('foreign_keys = OFF')` / `db.pragma('foreign_keys = ON')` → setter, case 1
- `db.pragma('foreign_key_check')` → array-returning getter, case 3 (returns violation rows)

## Files to Update

### `drivers/BetterSqlite3Driver.ts`

Thin wrapper that delegates every call to the `better-sqlite3` `Database` instance. Implements `ISqliteDriver`. ~50 lines.

### `drivers/BunSqliteDriver.ts`

Wraps `bun:sqlite` `Database`. Key adaptations:

- `run()`: uses `db.run(sql, ...args)` on the Database instance — this is the bun:sqlite top-level method that returns `{ changes, lastInsertRowid }`. Note: `db.query(sql).run(...args)` returns `void` in bun:sqlite and must NOT be used here.
- `pragma()`: three-case logic as described in the API Compatibility Notes above
- `exec()`: calls `db.run(sql)` — callers must not pass multi-statement strings
- `transaction()`: `bun:sqlite` has native `.transaction()` with the same signature
  ~70 lines.

### `drivers/createDriver.ts`

Uses dynamic `import()` to avoid bundling both drivers. Runtime detection via `process.versions.bun`.

```typescript
export async function createDriver(dbPath: string): Promise<ISqliteDriver> {
  if (typeof process.versions['bun'] !== 'undefined') {
    const { BunSqliteDriver } = await import('./BunSqliteDriver');
    return new BunSqliteDriver(dbPath);
  }
  const { BetterSqlite3Driver } = await import('./BetterSqlite3Driver');
  return new BetterSqlite3Driver(dbPath);
}
```

Using dynamic `import()` ensures esbuild does not statically bundle the unused driver into the server output, avoiding the ABI issue entirely.

### `index.ts` (AionUIDatabase)

`createDriver()` is async (uses dynamic `import()`), so initialization must move out of the constructor. Use a **static async factory**:

```typescript
class AionUIDatabase {
  private constructor(private db: ISqliteDriver) {}

  static async create(dbPath: string): Promise<AionUIDatabase> {
    const driver = await createDriver(dbPath);
    const instance = new AionUIDatabase(driver);
    instance.initialize(); // sync schema + migrations
    return instance;
  }
}
```

`getDatabase()` becomes async and lazily awaits the first initialization:

```typescript
let dbInstancePromise: Promise<AionUIDatabase> | null = null;

export function getDatabase(): Promise<AionUIDatabase> {
  if (!dbInstancePromise) {
    dbInstancePromise = AionUIDatabase.create(resolveDbPath());
  }
  return dbInstancePromise;
}
```

**Call site impact (~80 callers across ~22 files):** Every `getDatabase()` call site must be updated to `await getDatabase()`. Most callers are already in `async` functions and require only a mechanical `await` addition. However, some callers are in synchronous methods (e.g., `PairingService.isUserAuthorized()` returning `boolean`). These methods must be converted to `async` and their return types updated to `Promise<boolean>` etc., which may propagate further up the call chain. Implementors must audit all 22 affected files for sync vs async context before starting.

Other changes:

- `private db: Database.Database` → `private db: ISqliteDriver`
- Remove `import BetterSqlite3` and `import type Database`
- All SQL methods remain unchanged

### `schema.ts`

Update all function signatures: `db: Database.Database` → `db: ISqliteDriver`.
**Multi-statement `exec()` splits required (3 call sites):** lines ~24, ~42, and ~63 each contain a CREATE TABLE followed by multiple CREATE INDEX statements. Each must be split into one `exec()` call per statement.

### `migrations.ts`

Update all function signatures and `IMigration.up` type: `db: Database.Database` → `db: ISqliteDriver`.
**Multi-statement `exec()` splits required (~30+ call sites across migrations v1–v15).** Every migration's `up` and `down` function that passes multiple SQL statements in a single `exec()` call must be split. Affected migrations include (non-exhaustive): v1.down, v2.up, v2.down, v6.down, v7.up, v7.down, v9.up, v10.up, v10.down, v11–v15 up/down. Implementors must audit every `exec()` call and split any compound string.

**Split strategy:** Splitting on `;` is safe for the current migration set (no SQL string literals contain `;`), but is fragile for future migrations. The recommended approach is to split each compound DDL string **manually in the source file** — replace one multi-statement `exec()` call with multiple single-statement calls. Do not implement a runtime string splitter; the runtime `exec()` wrapper in `BunSqliteDriver` calls `db.run(sql)` and callers are responsible for passing single statements.

## Build Script Changes (`scripts/build-server.mjs`)

Remove `better-sqlite3` from the `external` array. With dynamic `import()` in `createDriver.ts`, esbuild will not bundle the `BetterSqlite3Driver` when tree-shaking is effective. Add `bun:sqlite` to the `external` array — this is **required**, not optional. esbuild does not recognize `bun:sqlite` as a built-in module and will error if it is not marked external.

## Server Script Changes (`package.json`)

Replace `node dist-server/server.mjs` with `bun dist-server/server.mjs` in all four `server*` scripts. The build step (`node scripts/build-server.mjs`) continues to use `node`.

## Testing

- `BetterSqlite3Driver` unit tests: run under Vitest/Node.js using `:memory:` database
- `BunSqliteDriver` unit tests: **must run under bun** (`bun test`) using `:memory:` database — Vitest/Node cannot load `bun:sqlite`. Name test files `*.bun.test.ts`. Add a `test:bun` script to `package.json`: `"test:bun": "bun test src/process/services/database/drivers/*.bun.test.ts"`. The existing CI step for Vitest will skip these files; a separate CI step must invoke `bun test`.
- `AionUIDatabase` tests: inject either driver via constructor; existing test logic unchanged
- Integration: `bun run server` smoke test confirms startup without ABI errors

## Future PG Migration Path

The `ISqliteDriver` interface is SQLite-specific (synchronous, pragma-based). A future PostgreSQL migration would require:

1. A new `IDatabaseDriver` interface (async methods returning `Promise`)
2. All `AionUIDatabase` methods become `async`
3. `PostgresDriver` implementing `IDatabaseDriver`

The abstraction layer established here provides the correct boundary for that migration — the business logic in `AionUIDatabase` stays unchanged, only the driver and method signatures evolve.
