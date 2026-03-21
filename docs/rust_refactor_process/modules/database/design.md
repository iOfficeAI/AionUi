# Database Module -- Rust Design

> Replaces `better-sqlite3` (native npm package, node-gyp) with `rusqlite` (Rust, bundled SQLite).
> The Rust crate provides a **generic SQLite driver API**; all business logic stays in TypeScript.

## 1. TypeScript Interface Analysis

**Source files:**

- `src/process/services/database/index.ts` — AionUIDatabase class (45+ methods, 39KB)
- `src/process/services/database/schema.ts` — DDL init, version tracking via user_version pragma
- `src/process/services/database/migrations.ts` — 15 migration scripts (1073 lines)
- `src/process/services/database/types.ts` — IUser, IConversationRow, IMessageRow, conversion functions
- `src/process/services/database/StreamingMessageBuffer.ts` — Batched writes for streaming responses
- `src/process/services/database/SqliteConversationRepository.ts` — Repository wrapping AionUIDatabase
- `src/process/services/database/SqliteChannelRepository.ts` — Repository wrapping AionUIDatabase
- `src/process/services/database/export.ts` — Barrel exports

### Why driver replacement (not function migration)

Unlike auth and fs-bridge where specific pure functions moved to Rust, the database module is fundamentally different:

1. **45+ methods** with complex TS business types (`TChatConversation`, `TMessage`) that involve JSON serialization/deserialization and type discrimination. Rewriting these in Rust would be extremely complex for minimal gain.
2. **1073 lines of migrations** that are pure SQL strings executed via the driver. These stay in TS.
3. **Type conversion functions** (`rowToConversation`, `messageToRow`, etc.) depend on TS business types shared with the renderer. Duplicating these in Rust creates a maintenance burden.
4. **42 caller files** all use `AionUIDatabase` methods — the public API doesn't change.
5. **Primary motivation is build reliability** — eliminating `better-sqlite3` removes the most frequent source of cross-platform node-gyp compilation failures.

### better-sqlite3 API surface used

| Method | Usage Count | Pattern |
| --- | --- | --- |
| `.prepare(sql).run(...params)` | ~20 | INSERT, UPDATE, DELETE |
| `.prepare(sql).get(...params)` | ~18 | SELECT single row |
| `.prepare(sql).all(...params)` | ~12 | SELECT multiple rows |
| `.exec(sql)` | ~5 | Multi-statement DDL (schema, migrations) |
| `.pragma(name)` | ~4 | journal_mode, foreign_keys, user_version |
| `.close()` | 1 | Shutdown |
| `new BetterSqlite3(path)` | 1 | Constructor |

### Callers

All 42 caller files access the database through `AionUIDatabase` class methods. No file imports `better-sqlite3` directly outside the database module. The singleton `getDatabase()` pattern is the single entry point.

## 2. Rust API Design

### Crate: `aionui-db`

```
native/crates/aionui-db/
├── Cargo.toml
└── src/
    └── lib.rs      # rusqlite wrapper, value conversion
```

### Strategy: napi class replacing better-sqlite3

The Rust crate exposes a `Database` class via napi-rs that provides the same operations as `better-sqlite3` but backed by `rusqlite` with bundled SQLite.

```rust
#[napi]
pub struct Database {
    conn: rusqlite::Connection,
}

#[napi]
impl Database {
    #[napi(constructor)]
    pub fn new(path: String) -> Result<Self>;

    #[napi]
    pub fn close(&mut self) -> Result<()>;

    /// Execute raw SQL (multi-statement DDL). No params, no return.
    #[napi]
    pub fn exec(&self, sql: String) -> Result<()>;

    /// Execute single statement with params. Returns { changes, lastInsertRowid }.
    #[napi]
    pub fn run(&self, sql: String, params: Vec<serde_json::Value>) -> Result<RunResult>;

    /// Query single row. Returns JS object or null.
    #[napi]
    pub fn get(&self, sql: String, params: Vec<serde_json::Value>) -> Result<serde_json::Value>;

    /// Query multiple rows. Returns array of JS objects.
    #[napi]
    pub fn all(&self, sql: String, params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>>;

    /// Execute pragma. Returns the pragma value.
    #[napi]
    pub fn pragma_get(&self, name: String) -> Result<serde_json::Value>;

    /// Set pragma value.
    #[napi]
    pub fn pragma_set(&self, statement: String) -> Result<()>;
}
```

### Type Mapping (JS ↔ SQLite via serde_json::Value)

| JS type | serde_json::Value | SQLite type | Notes |
| --- | --- | --- | --- |
| `string` | `Value::String` | TEXT | |
| `number` (integer) | `Value::Number` | INTEGER | Safe integer range checked |
| `number` (float) | `Value::Number` | REAL | |
| `null` / `undefined` | `Value::Null` | NULL | |
| `boolean` | `Value::Bool` | INTEGER (0/1) | SQLite has no native bool |

### RunResult struct

```rust
#[napi(object)]
pub struct RunResult {
    pub changes: i64,
    pub last_insert_rowid: i64,
}
```

### Sync vs Async

**All methods are sync.** This matches `better-sqlite3`'s design. SQLite operations complete in microseconds to milliseconds and don't benefit from async. The embedded SQLite engine doesn't do network I/O.

## 3. Error Handling Strategy

```rust
// Internal errors mapped to napi::Error at the boundary
// No custom error enum needed — rusqlite errors are converted directly

fn map_err(e: rusqlite::Error) -> napi::Error {
    napi::Error::from_reason(format!("SQLite error: {}", e))
}
```

**Error message preservation:** `better-sqlite3` errors include the SQLite error message (e.g., "UNIQUE constraint failed: users.username"). `rusqlite` provides the same messages. TS callers catch errors with `error.message` — this contract is preserved.

## 4. FFI Boundary Design

### Parameter passing

better-sqlite3 accepts params as separate arguments: `.prepare(sql).run(a, b, c)`

The Rust API accepts params as an array: `.run(sql, [a, b, c])`

This requires a mechanical rewrite in AionUIDatabase:

```typescript
// Before (better-sqlite3)
this.db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?')
    .run(username, now, userId);

// After (Rust driver)
this.db.run('UPDATE users SET username = ?, updated_at = ? WHERE id = ?',
    [username, now, userId]);
```

### Result format

better-sqlite3 returns plain JS objects with column names as keys. The Rust driver does the same via `serde_json::Value::Object`, which napi-rs converts to a JS object.

### Pragma handling

better-sqlite3 has a single `.pragma()` method with overloaded behavior:
- `db.pragma('journal_mode = WAL')` — set pragma
- `db.pragma('user_version', { simple: true })` — get pragma value

The Rust driver splits this into two methods:
- `db.pragmaSet('journal_mode = WAL')` — set
- `db.pragmaGet('user_version')` — get value

### TypeScript declarations (index.d.ts additions)

```typescript
export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export class Database {
  constructor(path: string);
  close(): void;
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): RunResult;
  get(sql: string, params?: unknown[]): Record<string, unknown> | null;
  all(sql: string, params?: unknown[]): Record<string, unknown>[];
  pragmaGet(name: string): unknown;
  pragmaSet(statement: string): void;
}
```

## 5. Migration Plan

**Strategy: Internal refactoring** (same pattern as auth and fs-bridge)

### Step-by-step

1. **Build Rust crate** — `aionui-db` with `Database` class, passing `cargo test`.
2. **Add napi bindings** — The `Database` class IS the binding (napi methods on the struct).
3. **Update `index.ts`** — Replace `import BetterSqlite3 from 'better-sqlite3'` with `import { Database } from '@aionui/native'`. Rewrite all `.prepare().run/get/all()` calls to `.run/get/all()` with array params.
4. **Update `schema.ts`** — Change parameter type from `Database.Database` to the Rust `Database` class. Update `.pragma()` calls to `.pragmaGet()` / `.pragmaSet()`.
5. **Update `migrations.ts`** — Same type change. Migration SQL strings stay unchanged.
6. **Remove `better-sqlite3`** — Delete from `dependencies` in package.json. Delete `@types/better-sqlite3` from `devDependencies`.
7. **Run full test suite** — All 1256+ tests must pass.

### Mechanical rewrite patterns

| Before (better-sqlite3) | After (Rust driver) |
| --- | --- |
| `new BetterSqlite3(path)` | `new Database(path)` |
| `db.prepare(sql).run(a, b, c)` | `db.run(sql, [a, b, c])` |
| `db.prepare(sql).get(a) as T` | `db.get(sql, [a]) as T` |
| `db.prepare(sql).all(a) as T[]` | `db.all(sql, [a]) as T[]` |
| `db.exec(sql)` | `db.exec(sql)` (unchanged) |
| `db.pragma('journal_mode = WAL')` | `db.pragmaSet('journal_mode = WAL')` |
| `db.pragma('user_version', { simple: true })` | `db.pragmaGet('user_version')` |
| `db.pragma('user_version = N')` | `db.pragmaSet('user_version = N')` |
| `db.close()` | `db.close()` (unchanged) |
| `type Database.Database` | `type Database` (from @aionui/native) |

### Backward Compatibility

- `AionUIDatabase` public API is **unchanged** — all 45+ methods keep their signatures.
- All 42 caller files require **zero changes** — they use `AionUIDatabase` methods, not `better-sqlite3` directly.
- Repository interfaces (`IConversationRepository`, `IChannelRepository`) are **unchanged**.
- Type conversions (`rowToConversation`, etc.) are **unchanged**.
- The `export.ts` barrel export is **unchanged**.

### npm dependency changes

| Package | Before | After |
| --- | --- | --- |
| `better-sqlite3` | dependencies | **removed** |
| `@types/better-sqlite3` | devDependencies | **removed** |

## 6. Test Strategy

### Contract Tests (`tests/contract/db-contract.test.ts`)

Test the Rust `Database` class directly against the same SQL operations that AionUIDatabase uses:

| Operation | Test Cases |
| --- | --- |
| `new Database(path)` | Opens DB file; creates if not exists; handles invalid path |
| `exec(sql)` | CREATE TABLE; multi-statement DDL; error on invalid SQL |
| `run(sql, params)` | INSERT returns changes=1; UPDATE returns correct changes count; DELETE returns changes |
| `get(sql, params)` | SELECT returns object with column names; returns null for no match; handles NULL columns |
| `all(sql, params)` | SELECT returns array of objects; empty result returns []; ORDER BY respected |
| `pragmaGet/Set` | journal_mode; user_version; foreign_keys |
| `close()` | Closes connection; subsequent calls throw |

### Type Mapping Tests

| Scenario | Input (JS) | Expected (SQLite → JS) |
| --- | --- | --- |
| String | `'hello'` | TEXT → `'hello'` |
| Integer | `42` | INTEGER → `42` |
| Float | `3.14` | REAL → `3.14` |
| Null | `null` | NULL → `null` |
| Boolean true | `true` | INTEGER 1 → `1` (number, not boolean) |
| Boolean false | `false` | INTEGER 0 → `0` (number, not boolean) |
| Large integer | `Number.MAX_SAFE_INTEGER` | INTEGER → same value |

### Migration Tests

- Existing `readDirectoryRecursive.test.ts` and all database-related tests must pass unchanged.
- `bun run test` full suite must be green.
