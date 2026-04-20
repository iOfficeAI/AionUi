// @ts-nocheck -- bun:sqlite is a Bun built-in, not visible to tsc
import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { performance } from 'perf_hooks';
import { initSchema } from '@process/services/database/schema';
import type { ISqliteDriver, IStatement } from '@process/services/database/drivers/ISqliteDriver';

// ── bun:sqlite ISqliteDriver adapter ───────────────────────────────────────

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
    return this.db.run(this.sql, ...args);
  }
}

class InMemoryDriver implements ISqliteDriver {
  private db: Database;

  constructor() {
    this.db = new Database(':memory:');
  }

  prepare(sql: string): IStatement {
    return new BunStatement(this.db, sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    if (sql.includes('=')) {
      this.db.run(`PRAGMA ${sql}`);
      return undefined;
    }
    if (options?.simple) {
      const row = this.db.query(`PRAGMA ${sql}`).get() as Record<string, unknown> | null;
      if (!row) return undefined;
      return Object.values(row)[0];
    }
    return this.db.query(`PRAGMA ${sql}`).all();
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}

// ── Bench helper ───────────────────────────────────────────────────────────

type BenchResult = {
  name: string;
  suite: string;
  ops: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
};

const results: BenchResult[] = [];

function runBench(name: string, suite: string, fn: () => void, iterations = 100): BenchResult {
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const sorted = times.toSorted((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const result: BenchResult = {
    name,
    suite,
    ops: Math.round(1000 / mean),
    meanMs: Math.round(mean * 1000) / 1000,
    minMs: Math.round(sorted[0] * 1000) / 1000,
    maxMs: Math.round(sorted[sorted.length - 1] * 1000) / 1000,
  };
  results.push(result);
  return result;
}

// ── Seed large dataset ─────────────────────────────────────────────────────

const LARGE_CONV_COUNT = 10_000;
const LARGE_MSGS_PER_CONV = 10;
const LARGE_USER_ID = 'user-large';
const LARGE_KEYWORD = 'needle-in-haystack';
const SUITE = 'Large dataset degradation (10k conv / 100k msg)';

function createLargeDataset(): ISqliteDriver {
  const driver = new InMemoryDriver();
  initSchema(driver);

  const seedNow = Date.now();
  driver
    .prepare('INSERT INTO users (id, username, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(LARGE_USER_ID, 'large-user', 'large@test.com', 'hash', seedNow, seedNow);

  const insertConv = driver.prepare(
    'INSERT INTO conversations (id, user_id, name, type, extra, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertMsg = driver.prepare(
    'INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const acpConfigPayload = JSON.stringify({
    acp: {
      agent: 'claude-code',
      workspace: '/Users/demo/project',
      permissions: { read: ['src/**'], write: ['src/**'], execute: ['bun', 'node'] },
      env: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`VAR_${i}`, `value-${i}`])),
      toolAllowlist: Array.from({ length: 30 }, (_, i) => `tool-${i}`),
    },
  });

  const seed = driver.transaction(() => {
    for (let c = 0; c < LARGE_CONV_COUNT; c++) {
      const convId = `lconv-${c}`;
      const hasCron = c % 50 === 0;
      const hasAcp = c % 20 === 0;
      let extra = '{}';
      if (hasCron && hasAcp) {
        extra = JSON.stringify({ cronJobId: `cron-${c}`, ...JSON.parse(acpConfigPayload) });
      } else if (hasCron) {
        extra = `{"cronJobId":"cron-${c}"}`;
      } else if (hasAcp) {
        extra = acpConfigPayload;
      }

      insertConv.run(
        convId,
        LARGE_USER_ID,
        `Conversation ${c}`,
        'chat',
        extra,
        'gpt-4',
        'finished',
        seedNow - c * 1000,
        seedNow - c * 1000
      );

      for (let m = 0; m < LARGE_MSGS_PER_CONV; m++) {
        const content =
          c % 100 === 0 && m === 0
            ? `This message mentions ${LARGE_KEYWORD} for search testing`
            : `Regular message ${m} in conversation ${c} with filler content`;
        insertMsg.run(
          `lmsg-${c}-${m}`,
          convId,
          `mid-${c}-${m}`,
          'text',
          content,
          m % 2 === 0 ? 'left' : 'right',
          'finish',
          seedNow + c * 100 + m
        );
      }
    }
  });
  seed();

  return driver;
}

// ── Tests (each test runs a bench and asserts it completes) ────────────────

describe('Large dataset degradation (10k conv / 100k msg)', () => {
  const driver = createLargeDataset();

  const listConvStmt = driver.prepare(
    'SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  );
  const countConvStmt = driver.prepare('SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?');
  const countMsgStmt = driver.prepare('SELECT COUNT(*) AS n FROM messages');
  const likeMsgStmt = driver.prepare(
    'SELECT id, content, created_at FROM messages WHERE content LIKE ? ORDER BY created_at DESC LIMIT 50'
  );
  const jsonExtractStmt = driver.prepare(
    "SELECT id, name FROM conversations WHERE user_id = ? AND json_extract(extra, '$.cronJobId') = ?"
  );
  const joinSearchStmt = driver.prepare(`
    SELECT m.id, m.content, m.created_at, c.id AS conversation_id, c.name AS conversation_name
    FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.content LIKE ?
    ORDER BY m.created_at DESC LIMIT 50
  `);

  test('paginate conversations — page 1', () => {
    const r = runBench('paginate page 1 (offset 0, limit 20)', SUITE, () => {
      listConvStmt.all(LARGE_USER_ID, 20, 0);
    });
    expect(r.meanMs).toBeLessThan(10);
  });

  test('paginate conversations — page 100', () => {
    const r = runBench('paginate page 100 (offset 1980, limit 20)', SUITE, () => {
      listConvStmt.all(LARGE_USER_ID, 20, 1980);
    });
    expect(r.meanMs).toBeLessThan(10);
  });

  test('paginate conversations — page 500', () => {
    const r = runBench('paginate page 500 (offset 9980, limit 20)', SUITE, () => {
      listConvStmt.all(LARGE_USER_ID, 20, 9980);
    });
    expect(r.meanMs).toBeLessThan(10);
  });

  test('count conversations by user', () => {
    const r = runBench('count conversations by user', SUITE, () => {
      countConvStmt.get(LARGE_USER_ID);
    });
    expect(r.meanMs).toBeLessThan(10);
  });

  test('count all messages', () => {
    const r = runBench('count all messages', SUITE, () => {
      countMsgStmt.get();
    });
    expect(r.meanMs).toBeLessThan(10);
  });

  test('LIKE search 100k messages (match)', () => {
    const r = runBench(
      'LIKE search 100k (match)',
      SUITE,
      () => {
        likeMsgStmt.all(`%${LARGE_KEYWORD}%`);
      },
      50
    );
    expect(r.meanMs).toBeLessThan(100);
  });

  test('LIKE search 100k messages (no match)', () => {
    const r = runBench(
      'LIKE search 100k (no match)',
      SUITE,
      () => {
        likeMsgStmt.all('%does-not-exist-xyz%');
      },
      50
    );
    expect(r.meanMs).toBeLessThan(100);
  });

  test('json_extract on conversations.extra.cronJobId', () => {
    const r = runBench('json_extract cronJobId', SUITE, () => {
      jsonExtractStmt.all(LARGE_USER_ID, 'cron-500');
    });
    expect(r.meanMs).toBeLessThan(50);
  });

  test('JOIN search — match', () => {
    const r = runBench(
      'JOIN search (match)',
      SUITE,
      () => {
        joinSearchStmt.all(LARGE_USER_ID, `%${LARGE_KEYWORD}%`);
      },
      50
    );
    expect(r.meanMs).toBeLessThan(100);
  });

  test('JOIN search — no match', () => {
    const r = runBench(
      'JOIN search (no match)',
      SUITE,
      () => {
        joinSearchStmt.all(LARGE_USER_ID, '%does-not-exist-xyz%');
      },
      50
    );
    expect(r.meanMs).toBeLessThan(100);
  });
});

// ── Output JSON for run-benchmarks.ts to consume ───────────────────────────

import { afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

afterAll(() => {
  const outputDir = resolve(import.meta.dir, '../../scripts/benchmark-results');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, 'db-bench-latest.json'), JSON.stringify(results, null, 2));
});
