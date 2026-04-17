import { bench, describe } from 'vitest';
import { initSchema } from '@process/services/database/schema';
import type { ISqliteDriver, IStatement } from '@process/services/database/drivers/ISqliteDriver';

type StatementRunResult = { changes: number; lastInsertRowid: number | bigint };

// Detect at module level whether native module is usable.
// In Electron projects, better-sqlite3 is compiled for Electron's Node ABI,
// not the system Node that vitest runs under. The require() may succeed but
// constructing a Database instance throws the ABI mismatch error.
let Database: typeof import('better-sqlite3').default;
let SKIP = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Database = require('better-sqlite3');
  const probe = new Database(':memory:');
  probe.close();
} catch {
  SKIP = true;
}

class InMemoryDriver implements ISqliteDriver {
  private db: InstanceType<typeof Database>;

  constructor() {
    this.db = new Database(':memory:');
  }

  prepare(sql: string): IStatement {
    const stmt = this.db.prepare(sql);
    return {
      get(...args: unknown[]): unknown {
        return stmt.get(...args);
      },
      all(...args: unknown[]): unknown[] {
        return stmt.all(...args) as unknown[];
      },
      run(...args: unknown[]): StatementRunResult {
        return stmt.run(...args);
      },
    };
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

// When native module is not available, register a single no-op bench so vitest doesn't error.
if (SKIP) {
  describe('Database benchmarks (skipped — native module ABI mismatch)', () => {
    bench('no-op (run `npx electron-rebuild` to enable)', () => {});
  });
} else {
  // Large dataset degradation: 10k conversations + 100k messages.
  // The seeded driver is created once at module load and shared across all benches
  // below. Bulk insert uses a single transaction; otherwise seeding takes minutes.
  const LARGE_CONV_COUNT = 10_000;
  const LARGE_MSGS_PER_CONV = 10;
  const LARGE_USER_ID = 'user-large';
  const LARGE_KEYWORD = 'needle-in-haystack';

  function createLargeDataset(): ISqliteDriver {
    const driver = new InMemoryDriver();
    initSchema(driver);

    const seedNow = Date.now();

    driver
      .prepare(
        'INSERT INTO users (id, username, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(LARGE_USER_ID, 'large-user', 'large@test.com', 'hash', seedNow, seedNow);

    const insertConv = driver.prepare(
      'INSERT INTO conversations (id, user_id, name, type, extra, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertMsg = driver.prepare(
      'INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    // Simulated ACP config payload (~2KB of nested JSON) attached to a subset
    // of conversations — models real-world rows where `extra` carries agent
    // connection protocol state, not just a small id.
    const acpConfigPayload = JSON.stringify({
      acp: {
        agent: 'claude-code',
        workspace: '/Users/demo/project',
        permissions: {
          read: ['src/**', 'tests/**', 'docs/**'],
          write: ['src/**', 'tests/**'],
          execute: ['bun', 'node', 'git'],
        },
        env: Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [`VAR_${i}`, `value-${i}-with-some-filler-content`])
        ),
        toolAllowlist: Array.from({ length: 30 }, (_, i) => `tool-${i}`),
        lastSessionId: 'sess-xyz-123456',
      },
    });

    const seed = driver.transaction(() => {
      for (let c = 0; c < LARGE_CONV_COUNT; c++) {
        const convId = `lconv-${c}`;
        // Sprinkle a cronJobId on every 50th conversation so json_extract queries
        // return a realistic non-empty result set (~200 matches). Every 20th row
        // additionally embeds a large ACP config blob to model rows with heavy
        // extra payloads.
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
        // updated_at is offset by index so ORDER BY updated_at DESC produces a
        // deterministic, stable ordering across pages.
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
          // Roughly 0.1% of messages contain the search keyword (~100 matches
          // across 100k rows), matching a realistic full-text search result size.
          const content =
            c % 100 === 0 && m === 0
              ? `This message mentions ${LARGE_KEYWORD} for search testing`
              : `Regular message ${m} in conversation ${c} with filler content for realistic row width`;
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
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ? AND m.content LIKE ?
      ORDER BY m.created_at DESC
      LIMIT 50
    `);

    bench('paginate conversations — page 1 (offset 0, limit 20)', () => {
      listConvStmt.all(LARGE_USER_ID, 20, 0);
    });

    bench('paginate conversations — page 100 (offset 1980, limit 20)', () => {
      listConvStmt.all(LARGE_USER_ID, 20, 1980);
    });

    bench('paginate conversations — page 500 (offset 9980, limit 20)', () => {
      listConvStmt.all(LARGE_USER_ID, 20, 9980);
    });

    bench('count conversations by user', () => {
      countConvStmt.get(LARGE_USER_ID);
    });

    bench('count all messages', () => {
      countMsgStmt.get();
    });

    bench('LIKE search across 100k messages (match)', () => {
      likeMsgStmt.all(`%${LARGE_KEYWORD}%`);
    });

    bench('LIKE search across 100k messages (no match)', () => {
      likeMsgStmt.all('%does-not-exist-xyz%');
    });

    bench('json_extract on conversations.extra.cronJobId', () => {
      jsonExtractStmt.all(LARGE_USER_ID, 'cron-500');
    });

    bench('JOIN search — messages + conversations by user + LIKE', () => {
      joinSearchStmt.all(LARGE_USER_ID, `%${LARGE_KEYWORD}%`);
    });

    bench('JOIN search — no match', () => {
      joinSearchStmt.all(LARGE_USER_ID, '%does-not-exist-xyz%');
    });
  });
}
