# Database Module -- Benchmark

> Comparing `better-sqlite3` (C++ addon, node-gyp) vs `aionui-db` (Rust, rusqlite bundled).
> Primary migration goal is **build reliability** (eliminate node-gyp), not raw performance.

## Environment

| Item    | Value                                      |
| ------- | ------------------------------------------ |
| OS      | Windows 11 (x64)                           |
| CPU     | 13th Gen Intel Core i5-13500HX             |
| RAM     | 39.7 GB                                    |
| Node.js | v22.12.0                                   |
| SQLite  | bundled via rusqlite 0.31 / libsqlite3-sys |
| Mode    | All-in-memory unless noted; sync operations |

## Results

### Single-row operations

| Operation        | better-sqlite3 (p50) | Rust (p50) | Ratio           |
| ---------------- | --------------------- | ---------- | --------------- |
| Single INSERT    | 15us                  | 12us       | **1.2x faster** |
| Single GET by PK | 15us                  | 14us       | **1.1x faster** |
| pragma get       | 3.9us                 | 1.0us      | **3.9x faster** |

Single-row operations are the dominant pattern in AionUIDatabase (~38 of 50 prepare() calls). The Rust driver matches or beats better-sqlite3 here.

### Multi-statement / DDL

| Operation              | better-sqlite3 (p50) | Rust (p50) | Ratio       |
| ---------------------- | --------------------- | ---------- | ----------- |
| exec (CREATE TABLE x3) | 0.243ms               | 0.310ms    | 1.3x slower |

The exec benchmark includes Database constructor overhead. The DDL path runs once at app startup and during migrations, so the 0.07ms difference is negligible.

### Batch and bulk operations

| Operation            | better-sqlite3 (p50) | Rust (p50) | Ratio           |
| -------------------- | --------------------- | ---------- | --------------- |
| Batch INSERT (100)   | 1.68ms                | 1.35ms     | **1.2x faster** |
| SELECT all 100 rows  | 0.144ms               | 0.627ms    | 4.4x slower     |
| SELECT all 1000 rows | 1.26ms                | 4.78ms     | 3.8x slower     |

### Composite workloads

| Operation                         | better-sqlite3 (p50) | Rust (p50) | Ratio        |
| --------------------------------- | --------------------- | ---------- | ------------ |
| Mixed (1 INSERT + 1 get + 1 all)  | 0.033ms               | 0.052ms    | 1.6x slower  |
| File-based INSERT+SELECT (WAL)    | 0.035ms               | 2.00ms     | 56x slower*  |

*See "File-based performance" section below.

## Analysis

### Why `all()` is slower

better-sqlite3 constructs JS objects directly via V8 C++ API -- a single-hop conversion from SQLite row to JS object. The Rust driver takes a double-hop path: rusqlite Row -> serde_json::Value -> napi serialize -> JS object. The serde_json intermediate representation adds allocation and conversion overhead that scales linearly with row count.

In practice, `all()` is used by ~12 of 50 query sites in AionUIDatabase, and most return small result sets (<50 rows). For a typical 20-row conversation list query, the overhead is roughly 0.12ms -> 0.3ms -- imperceptible to the user.

### File-based performance: the PRAGMA synchronous trap

The 56x file-based slowdown is **not an inherent Rust limitation** -- it is caused by different default PRAGMA settings:

- better-sqlite3: when switching to WAL mode, automatically sets `synchronous = NORMAL` (1)
- rusqlite: when switching to WAL mode, keeps `synchronous = FULL` (2)

With `synchronous = FULL`, every transaction commit triggers an fsync to disk. With `synchronous = NORMAL`, fsync is skipped for most commits (WAL provides crash safety).

After matching pragmas (`synchronous = NORMAL` on both):

| Operation             | better-sqlite3 | Rust    |
| --------------------- | --------------- | ------- |
| File INSERT+SELECT/op | 0.040ms         | 0.036ms |

Performance is equivalent. The migration must explicitly set `PRAGMA synchronous = NORMAL` after enabling WAL mode in `schema.ts`.

### Cache size difference

Default cache_size: better-sqlite3 = -16000 (16MB), rusqlite = -2000 (2MB). The migration should set `PRAGMA cache_size = -16000` to match.

## Migration recommendations

1. After `PRAGMA journal_mode = WAL`, always set `PRAGMA synchronous = NORMAL`
2. Set `PRAGMA cache_size = -16000` to match better-sqlite3 defaults
3. Both pragmas should go in `schema.ts` alongside the existing WAL setup
4. No code-level optimization needed for the serde_json overhead -- the real-world impact on <50 row queries is sub-millisecond

## Conclusion

The Rust driver is performance-neutral for the workload that matters: single-row CRUD operations that make up ~76% of the query sites. The `all()` overhead exists but is bounded and acceptable for the application's usage pattern (small result sets). The file-based "slowdown" is a pragma misconfiguration, not an architectural issue -- resolved by two lines in `schema.ts`.

The primary value proposition remains intact: eliminating better-sqlite3 removes the most common source of cross-platform node-gyp build failures, which was the stated goal.

## Script

Run the benchmark: `bunx tsx tests/bench/db-bench.ts`
