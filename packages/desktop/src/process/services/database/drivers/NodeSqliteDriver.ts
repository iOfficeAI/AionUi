// src/process/services/database/drivers/NodeSqliteDriver.ts

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { ISqliteDriver, IStatement } from './ISqliteDriver';

class NodeSqliteStatement implements IStatement {
  constructor(private stmt: StatementSync) {}

  get(...args: unknown[]): unknown {
    return this.stmt.get(...(args as never[]));
  }

  all(...args: unknown[]): unknown[] {
    return this.stmt.all(...(args as never[])) as unknown[];
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const result = this.stmt.run(...(args as never[]));
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  }
}

/**
 * ISqliteDriver backed by Node's built-in `node:sqlite` (DatabaseSync).
 *
 * Behavioral parity with BetterSqlite3Driver:
 * - Foreign keys are left OFF (DatabaseSync enables them by default; better-sqlite3
 *   does not). The migration layer toggles foreign_keys explicitly, so we keep the
 *   legacy default to avoid altering migration semantics.
 * - `pragma()` is emulated via prepared statements since node:sqlite exposes no
 *   dedicated pragma method.
 * - `transaction()` mirrors better-sqlite3: returns a wrapper that runs the function
 *   inside BEGIN/COMMIT, using SAVEPOINTs when already inside a transaction.
 */
export class NodeSqliteDriver implements ISqliteDriver {
  private db: DatabaseSync;
  private txDepth = 0;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: false });
  }

  prepare(sql: string): IStatement {
    return new NodeSqliteStatement(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    const rows = this.db.prepare(`PRAGMA ${sql}`).all() as Array<Record<string, unknown>>;
    if (options?.simple) {
      if (rows.length === 0) return undefined;
      const values = Object.values(rows[0]);
      return values.length > 0 ? values[0] : undefined;
    }
    return rows;
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return (...args: unknown[]): T => {
      const useSavepoint = this.txDepth > 0;
      const savepoint = `_aionui_sp_${this.txDepth}`;
      if (useSavepoint) {
        this.db.exec(`SAVEPOINT ${savepoint}`);
      } else {
        this.db.exec('BEGIN');
      }
      this.txDepth++;
      try {
        const result = fn(...args);
        if (useSavepoint) {
          this.db.exec(`RELEASE ${savepoint}`);
        } else {
          this.db.exec('COMMIT');
        }
        return result;
      } catch (error) {
        if (useSavepoint) {
          this.db.exec(`ROLLBACK TO ${savepoint}`);
          this.db.exec(`RELEASE ${savepoint}`);
        } else {
          this.db.exec('ROLLBACK');
        }
        throw error;
      } finally {
        this.txDepth--;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}
