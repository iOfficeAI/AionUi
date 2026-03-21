/**
 * Benchmark: better-sqlite3 vs Rust Database (aionui-db)
 * Run with: bunx tsx tests/bench/db-bench.ts
 */
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import process from 'node:process';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Rust implementation
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Database: RustDatabase } = require('@aionui/native') as {
  Database: new (path: string) => {
    close(): void;
    exec(sql: string): void;
    run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number };
    get(sql: string, params?: unknown[]): Record<string, unknown> | null;
    all(sql: string, params?: unknown[]): Record<string, unknown>[];
    pragmaGet(name: string): unknown;
    pragmaSet(statement: string): void;
  };
};

// better-sqlite3
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BetterSqlite3 = require('better-sqlite3') as new (
  path: string,
) => {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  pragma(source: string, options?: { simple?: boolean }): unknown;
};

// --- Bench utilities ---

const ITERATIONS = 5_000;
const WARMUP = 500;

type BenchResult = { p50: number; p95: number; p99: number };

function benchSync(fn: () => void, iterations = ITERATIONS, warmup = WARMUP): BenchResult {
  for (let i = 0; i < warmup; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    p50: times[Math.floor(times.length * 0.5)]!,
    p95: times[Math.floor(times.length * 0.95)]!,
    p99: times[Math.floor(times.length * 0.99)]!,
  };
}

function fmt(ms: number): string {
  if (ms < 0.01) return `${(ms * 1000).toFixed(1)}µs`;
  if (ms < 1) return `${ms.toFixed(3)}ms`;
  return `${ms.toFixed(2)}ms`;
}

function speedup(ts: number, rust: number): string {
  if (rust === 0) return 'Inf';
  const ratio = ts / rust;
  return ratio >= 1 ? `${ratio.toFixed(1)}x` : `${(1 / ratio).toFixed(1)}x slower`;
}

function printRow(label: string, bs3: BenchResult, rs: BenchResult): void {
  console.log(`  better-sqlite3: p50=${fmt(bs3.p50)} p95=${fmt(bs3.p95)} p99=${fmt(bs3.p99)}`);
  console.log(`  Rust Database:  p50=${fmt(rs.p50)} p95=${fmt(rs.p95)} p99=${fmt(rs.p99)}`);
  console.log(`  Speedup (p50):  ${speedup(bs3.p50, rs.p50)}`);
}

// --- Schema used for benchmarks ---

const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX idx_messages_user ON messages(user_id);
`;

// --- Main ---

async function main() {
  console.log('=== Database Benchmark: better-sqlite3 vs Rust (aionui-db) ===\n');
  console.log(`OS:      ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU:     ${os.cpus()[0]?.model ?? 'unknown'}`);
  console.log(`RAM:     ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
  console.log(`Node.js: ${process.version}`);
  console.log('');

  const tmpBase = await fsp.mkdtemp(path.join(os.tmpdir(), 'aionui-db-bench-'));

  try {
    // ================================================================
    // 1. exec — multi-statement DDL
    // ================================================================
    console.log('--- exec: multi-statement DDL ---');
    const bs3Exec = benchSync(() => {
      const db = new BetterSqlite3(':memory:');
      db.exec(SCHEMA);
      db.close();
    }, 1000, 100);
    const rsExec = benchSync(() => {
      const db = new RustDatabase(':memory:');
      db.exec(SCHEMA);
      db.close();
    }, 1000, 100);
    printRow('exec', bs3Exec, rsExec);

    // ================================================================
    // 2. run — single INSERT
    // ================================================================
    console.log('\n--- run: single INSERT ---');
    const bs3Ins = new BetterSqlite3(':memory:');
    bs3Ins.exec(SCHEMA);
    const rsIns = new RustDatabase(':memory:');
    rsIns.exec(SCHEMA);
    const now = new Date().toISOString();

    const bs3InsResult = benchSync(() => {
      bs3Ins.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run('alice', 'a@b.com', now);
    });
    const rsInsResult = benchSync(() => {
      rsIns.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', ['alice', 'a@b.com', now]);
    });
    printRow('INSERT', bs3InsResult, rsInsResult);
    bs3Ins.close();
    rsIns.close();

    // ================================================================
    // 3. run — batch INSERT (100 rows per iteration)
    // ================================================================
    console.log('\n--- run: batch INSERT (100 rows) ---');
    const bs3Batch = new BetterSqlite3(':memory:');
    bs3Batch.exec(SCHEMA);
    const rsBatch = new RustDatabase(':memory:');
    rsBatch.exec(SCHEMA);

    const bs3BatchResult = benchSync(() => {
      for (let i = 0; i < 100; i++) {
        bs3Batch.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run(`user${i}`, `u${i}@b.com`, now);
      }
    }, 500, 50);
    const rsBatchResult = benchSync(() => {
      for (let i = 0; i < 100; i++) {
        rsBatch.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', [`user${i}`, `u${i}@b.com`, now]);
      }
    }, 500, 50);
    printRow('batch INSERT', bs3BatchResult, rsBatchResult);
    bs3Batch.close();
    rsBatch.close();

    // ================================================================
    // 4. get — single row lookup by PK
    // ================================================================
    console.log('\n--- get: single row by PK ---');
    const bs3Get = new BetterSqlite3(':memory:');
    bs3Get.exec(SCHEMA);
    for (let i = 0; i < 1000; i++) {
      bs3Get.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run(`user${i}`, `u${i}@b.com`, now);
    }
    const rsGet = new RustDatabase(':memory:');
    rsGet.exec(SCHEMA);
    for (let i = 0; i < 1000; i++) {
      rsGet.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', [`user${i}`, `u${i}@b.com`, now]);
    }

    let idx = 0;
    const bs3GetResult = benchSync(() => {
      bs3Get.prepare('SELECT * FROM users WHERE id = ?').get((idx++ % 1000) + 1);
    });
    idx = 0;
    const rsGetResult = benchSync(() => {
      rsGet.get('SELECT * FROM users WHERE id = ?', [(idx++ % 1000) + 1]);
    });
    printRow('get by PK', bs3GetResult, rsGetResult);
    bs3Get.close();
    rsGet.close();

    // ================================================================
    // 5. all — SELECT 100 rows
    // ================================================================
    console.log('\n--- all: SELECT 100 rows ---');
    const bs3All = new BetterSqlite3(':memory:');
    bs3All.exec(SCHEMA);
    for (let i = 0; i < 100; i++) {
      bs3All.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run(`user${i}`, `u${i}@b.com`, now);
    }
    const rsAll = new RustDatabase(':memory:');
    rsAll.exec(SCHEMA);
    for (let i = 0; i < 100; i++) {
      rsAll.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', [`user${i}`, `u${i}@b.com`, now]);
    }

    const bs3AllResult = benchSync(() => {
      bs3All.prepare('SELECT * FROM users').all();
    });
    const rsAllResult = benchSync(() => {
      rsAll.all('SELECT * FROM users');
    });
    printRow('all 100 rows', bs3AllResult, rsAllResult);
    bs3All.close();
    rsAll.close();

    // ================================================================
    // 6. all — SELECT 1000 rows
    // ================================================================
    console.log('\n--- all: SELECT 1000 rows ---');
    const bs3All1k = new BetterSqlite3(':memory:');
    bs3All1k.exec(SCHEMA);
    for (let i = 0; i < 1000; i++) {
      bs3All1k.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run(`user${i}`, `u${i}@b.com`, now);
    }
    const rsAll1k = new RustDatabase(':memory:');
    rsAll1k.exec(SCHEMA);
    for (let i = 0; i < 1000; i++) {
      rsAll1k.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', [`user${i}`, `u${i}@b.com`, now]);
    }

    const bs3All1kResult = benchSync(() => {
      bs3All1k.prepare('SELECT * FROM users').all();
    }, 1000, 100);
    const rsAll1kResult = benchSync(() => {
      rsAll1k.all('SELECT * FROM users');
    }, 1000, 100);
    printRow('all 1000 rows', bs3All1kResult, rsAll1kResult);
    bs3All1k.close();
    rsAll1k.close();

    // ================================================================
    // 7. pragma — get/set
    // ================================================================
    console.log('\n--- pragma: get user_version ---');
    const bs3Pragma = new BetterSqlite3(':memory:');
    bs3Pragma.pragma('user_version = 42');
    const rsPragma = new RustDatabase(':memory:');
    rsPragma.pragmaSet('user_version = 42');

    const bs3PragmaResult = benchSync(() => {
      bs3Pragma.pragma('user_version', { simple: true });
    });
    const rsPragmaResult = benchSync(() => {
      rsPragma.pragmaGet('user_version');
    });
    printRow('pragma get', bs3PragmaResult, rsPragmaResult);
    bs3Pragma.close();
    rsPragma.close();

    // ================================================================
    // 8. Mixed workload — realistic pattern
    // ================================================================
    console.log('\n--- mixed: realistic read/write pattern ---');
    const bs3Mix = new BetterSqlite3(':memory:');
    bs3Mix.exec(SCHEMA);
    const rsMix = new RustDatabase(':memory:');
    rsMix.exec(SCHEMA);

    // Seed both with 100 users
    for (let i = 0; i < 100; i++) {
      bs3Mix.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run(`user${i}`, `u${i}@b.com`, now);
      rsMix.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', [`user${i}`, `u${i}@b.com`, now]);
    }

    let mixIdx = 0;
    const bs3MixResult = benchSync(() => {
      const i = mixIdx++;
      // 1 write
      bs3Mix.prepare('INSERT INTO messages (user_id, content, role, created_at) VALUES (?, ?, ?, ?)').run(
        (i % 100) + 1, `Message content ${i}`, 'user', now,
      );
      // 2 reads
      bs3Mix.prepare('SELECT * FROM users WHERE id = ?').get((i % 100) + 1);
      bs3Mix.prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 10').all((i % 100) + 1);
    }, 2000, 200);

    mixIdx = 0;
    const rsMixResult = benchSync(() => {
      const i = mixIdx++;
      rsMix.run('INSERT INTO messages (user_id, content, role, created_at) VALUES (?, ?, ?, ?)', [
        (i % 100) + 1, `Message content ${i}`, 'user', now,
      ]);
      rsMix.get('SELECT * FROM users WHERE id = ?', [(i % 100) + 1]);
      rsMix.all('SELECT * FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 10', [(i % 100) + 1]);
    }, 2000, 200);
    printRow('mixed workload', bs3MixResult, rsMixResult);
    bs3Mix.close();
    rsMix.close();

    // ================================================================
    // 9. File-based database — real-world I/O
    // ================================================================
    console.log('\n--- file-based: INSERT + SELECT (WAL mode) ---');
    const bs3FilePath = path.join(tmpBase, 'bench-bs3.db');
    const rsFilePath = path.join(tmpBase, 'bench-rs.db');
    const bs3File = new BetterSqlite3(bs3FilePath);
    bs3File.pragma('journal_mode = WAL');
    bs3File.exec(SCHEMA);
    const rsFile = new RustDatabase(rsFilePath);
    rsFile.pragmaSet('journal_mode = WAL');
    rsFile.exec(SCHEMA);

    let fileIdx = 0;
    const bs3FileResult = benchSync(() => {
      const i = fileIdx++;
      bs3File.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run(`user${i}`, `u${i}@b.com`, now);
      bs3File.prepare('SELECT * FROM users WHERE id = ?').get(i + 1);
    }, 2000, 200);

    fileIdx = 0;
    const rsFileResult = benchSync(() => {
      const i = fileIdx++;
      rsFile.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', [`user${i}`, `u${i}@b.com`, now]);
      rsFile.get('SELECT * FROM users WHERE id = ?', [i + 1]);
    }, 2000, 200);
    printRow('file-based', bs3FileResult, rsFileResult);
    bs3File.close();
    rsFile.close();

    console.log('\n=== Benchmark complete ===');
  } finally {
    await fsp.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(console.error);
