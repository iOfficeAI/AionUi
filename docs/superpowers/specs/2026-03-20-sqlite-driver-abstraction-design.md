# SQLite Driver Abstraction Layer

**Date:** 2026-03-20
**Status:** Approved

## Problem

`better-sqlite3` is a native Node.js addon compiled against a specific Node.js ABI. Electron embeds its own Node.js fork (ABI 136), while the standalone server runs on system Node.js 22 (ABI 127). These ABIs are permanently incompatible — no single `better-sqlite3` binary can serve both runtimes.

## Goal

Allow `bun run server` to use `bun:sqlite` (no native ABI dependency) while `bun run start` (Electron) continues using `better-sqlite3`. The change must be transparent to all business logic in `AionUIDatabase`.

## Solution: Thin Driver Adapter (Approach A)

Introduce a `drivers/` sub-directory under `src/process/services/database/` containing a driver interface, two implementations, and a factory. `AionUIDatabase` is injected via the factory — its 1400+ lines of SQL business logic remain unchanged.

## File Structure

```
src/process/services/database/
├── drivers/
│   ├── ISqliteDriver.ts        # Driver interface
│   ├── BetterSqlite3Driver.ts  # Wraps better-sqlite3 (Electron)
│   ├── BunSqliteDriver.ts      # Wraps bun:sqlite (server mode)
│   └── createDriver.ts         # Runtime-detection factory
├── index.ts                    # AionUIDatabase — minimal changes only
└── ... (all other files unchanged)
```

## Interface (`ISqliteDriver.ts`)

```typescript
export interface IStatement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { changes: number };
}

export interface ISqliteDriver {
  prepare(sql: string): IStatement;
  exec(sql: string): void;
  close(): void;
}
```

Both `better-sqlite3` and `bun:sqlite` already satisfy this shape, so each driver wrapper is ~30 lines.

## Factory (`createDriver.ts`)

```typescript
export function createDriver(dbPath: string): ISqliteDriver {
  const isBun = typeof process.versions['bun'] !== 'undefined';
  return isBun ? new BunSqliteDriver(dbPath) : new BetterSqlite3Driver(dbPath);
}
```

## Changes to `AionUIDatabase` (`index.ts`)

Three targeted edits only:

1. Remove `import BetterSqlite3 from 'better-sqlite3'` and `import type Database from 'better-sqlite3'`
2. Change `private db: Database.Database` → `private db: ISqliteDriver`
3. Replace `new BetterSqlite3(finalPath)` with `createDriver(finalPath)` (two call sites in constructor)

All SQL methods, migrations, schema, and repository files are untouched.

## Server Script Changes

In `package.json`, replace `node dist-server/server.mjs` with `bun dist-server/server.mjs` in all four `server*` scripts. The build step (`node scripts/build-server.mjs`) keeps using `node`.

## API Compatibility Notes

| Feature | `better-sqlite3` | `bun:sqlite` | Adapter needed? |
|---------|-----------------|--------------|-----------------|
| `db.prepare(sql)` | yes | yes | no |
| `stmt.get(...args)` | yes | yes | no |
| `stmt.all(...args)` | yes | yes | no |
| `stmt.run(...args).changes` | yes | yes | no |
| `db.exec(sql)` | yes | yes | no |
| `db.close()` | yes | yes | no |
| `stmt.run()` return type | `{ changes, lastInsertRowid: number }` | `{ changes, lastInsertRowid: bigint\|number }` | minimal — `IStatement.run()` only exposes `changes` |

## Future PG Migration Path

When PostgreSQL support is needed:

1. Add `PostgresDriver` implementing `ISqliteDriver` (or a renamed `IDatabaseDriver`)
2. `AionUIDatabase` methods will need to become `async` (PG is async, SQLite is sync)
3. All business logic remains in `AionUIDatabase` — migration is bounded and one-time

## Testing

- Unit tests for `BetterSqlite3Driver` and `BunSqliteDriver` using an in-memory database
- `AionUIDatabase` tests remain unchanged — inject either driver
- Integration: `bun run server` smoke test confirms startup without ABI errors
