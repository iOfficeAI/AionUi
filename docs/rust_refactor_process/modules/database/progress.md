# Database Module -- Progress

## Status

| Stage          | Status      | Date       | Notes                                                                                             |
| -------------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Design         | complete    | 2026-03-20 | Driver replacement strategy; Rust Database class replaces better-sqlite3; business logic stays TS |
| Implementation | complete    | 2026-03-20 | aionui-db crate + napi binding; 21 Rust unit tests + 33 contract tests passing                    |
| Benchmark      | complete    | 2026-03-21 | Single-row ops 1.1-1.2x faster; all() 4x slower (serde_json); file-based parity with pragma fix  |
| Migration      | complete    | 2026-03-21 | All callers migrated; better-sqlite3 removed; 1289 tests pass (2 pre-existing tray failures)      |

## Milestones

| Milestone           | Target | Actual     | Status  |
| ------------------- | ------ | ---------- | ------- |
| design.md complete  | --     | 2026-03-20 | done    |
| Crate compiles      | --     | 2026-03-20 | done    |
| Contract tests pass | --     | 2026-03-20 | done    |
| Benchmark complete  | --     | 2026-03-21 | done    |
| Callers migrated    | --     | 2026-03-21 | done    |
| Old TS removed      | --     | 2026-03-21 | done    |

## Decision Log

| Date       | Decision                                                                    | Rationale                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-20 | Driver replacement strategy (not function migration)                        | 45+ methods with complex TS business types; rewriting in Rust provides minimal gain vs massive complexity; primary goal is eliminating node-gyp     |
| 2026-03-20 | Rust Database class exposes generic SQL API (run/get/all/exec/pragma)       | Matches better-sqlite3 API pattern; enables mechanical rewrite of AionUIDatabase; no business logic in Rust                                        |
| 2026-03-20 | All methods sync (no AsyncTask)                                             | Matches better-sqlite3 behavior; SQLite is embedded, no network I/O; operations complete in microseconds                                           |
| 2026-03-20 | serde_json::Value for parameter/result passing                              | Natural JS↔JSON↔Rust mapping via napi-rs serde support; handles string/number/null/boolean transparently                                          |
| 2026-03-20 | Pragma split into pragmaGet/pragmaSet (not single overloaded method)        | better-sqlite3 overloads .pragma() with different signatures; splitting avoids complex napi parameter dispatch                                     |
| 2026-03-20 | Business logic, type conversions, migrations stay in TS                     | These depend on complex TS types shared with renderer; duplicating in Rust creates maintenance burden with no performance benefit                   |
| 2026-03-20 | rusqlite with `bundled` feature for SQLite compilation                      | Eliminates external SQLite dependency; cross-compilation works automatically; SQLite version controlled by crate                                   |
| 2026-03-20 | better-sqlite3 and @types/better-sqlite3 removed from package.json         | No longer needed; this is the primary build reliability win (eliminates node-gyp cross-platform failures)                                          |
| 2026-03-20 | Pure Rust crate (aionui-db) + thin napi binding layer                       | Follows established pattern: pure logic in crates/ with zero napi types; binding/ provides thin adapter with error mapping                         |
| 2026-03-20 | Option\<Database\> wrapper in napi binding for close() semantics            | napi class methods cannot consume self; Option::take() on close, checked on every subsequent call                                                  |
| 2026-03-21 | Must set PRAGMA synchronous=NORMAL after WAL mode in migration             | rusqlite keeps synchronous=FULL by default; better-sqlite3 auto-downgrades to NORMAL when switching to WAL; 56x file I/O gap without this          |
| 2026-03-21 | Must set PRAGMA cache_size=-16000 to match better-sqlite3 defaults         | rusqlite defaults to -2000 (2MB); better-sqlite3 defaults to -16000 (16MB); affects query plan caching                                             |
| 2026-03-21 | index.d.ts get/all return `unknown`/`unknown[]` instead of Record          | Enables direct `as T` casts at call sites without double-cast; mirrors better-sqlite3's `any` return behavior                                      |
| 2026-03-21 | migrations.ts uses manual BEGIN/COMMIT/ROLLBACK instead of .transaction()  | Rust Database class has no .transaction() method; manual SQL transaction management achieves same atomicity                                         |
| 2026-03-21 | CronStore.ts also migrated (direct db.db access via @ts-expect-error)      | CronStore bypasses AionUIDatabase private db property; same .prepare() pattern needed updating                                                     |

## Blockers

| Blocker | Severity | Status | Resolution |
| ------- | -------- | ------ | ---------- |
| --      | --       | --     | --         |

## Confidence Assessment

| Aspect            | Level  | Notes                                                                                                                              |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| API compatibility | High   | AionUIDatabase public API unchanged; 42 caller files require zero changes; mechanical rewrite of internal prepare→run/get/all calls |
| Performance gain  | Low    | SQLite operations are already fast; main gain is build reliability not speed                                                        |
| Migration risk    | Medium | 50 prepare() calls to rewrite; 1073 lines of migrations; schema.ts and migrations.ts type signature changes                       |
