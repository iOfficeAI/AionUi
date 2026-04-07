/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Async proxy for AionUIDatabase that delegates all method calls to a
 * dedicated worker thread. This prevents synchronous better-sqlite3
 * operations from blocking the Electron main process event loop.
 *
 * Usage is transparent to callers — every method on AionUIDatabase
 * becomes an async method that returns a Promise.
 */

import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { DbWorkerRequest, DbWorkerResponse } from './DatabaseWorkerProtocol';
import type { AionUIDatabase } from '../index';

type PendingRequest = { resolve: (value: unknown) => void; reject: (error: Error) => void };

let requestCounter = 0;

export class DatabaseProxy {
  private worker: Worker;
  private pending = new Map<string, PendingRequest>();
  private closed = false;

  private constructor(worker: Worker) {
    this.worker = worker;
    this.worker.on('message', (msg: DbWorkerResponse) => {
      if (msg.type === 'ready') return; // ready signal handled during create()
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.type === 'error') {
        entry.reject(new Error(msg.message));
      } else {
        entry.resolve(msg.data);
      }
    });
    this.worker.on('error', (err) => {
      this.closed = true;
      for (const [, entry] of this.pending) {
        entry.reject(err);
      }
      this.pending.clear();
    });
  }

  /**
   * Create a DatabaseProxy by spawning a worker thread that initializes
   * AionUIDatabase internally. Returns only after the worker signals ready.
   */
  static create(dbPath: string): Promise<DatabaseProxy> {
    return new Promise<DatabaseProxy>((resolve, reject) => {
      // Resolve the worker entry point.  electron-vite compiles all rollup
      // entry files into out/main/, but code-split chunks land in out/main/chunks/.
      // __dirname may point to either location, so we always resolve relative to
      // the parent of chunks/ to reach out/main/db-worker.js.
      const baseDir = __dirname.endsWith('chunks') ? path.resolve(__dirname, '..') : __dirname;
      const workerPath = path.resolve(baseDir, 'db-worker.js');
      console.log('[DatabaseProxy] starting worker at:', workerPath, '__dirname:', __dirname);
      const worker = new Worker(workerPath, { workerData: { dbPath } });

      const onExit = (code: number) => {
        worker.off('message', onMessage);
        worker.off('error', onError);
        if (code !== 0) {
          reject(new Error(`Database worker exited unexpectedly with code ${code}`));
        }
      };
      const onMessage = (msg: DbWorkerResponse) => {
        console.log('[DatabaseProxy] worker message:', msg.type, msg.id);
        if (msg.type === 'ready') {
          console.log('[DatabaseProxy] worker ready!');
          worker.off('message', onMessage);
          worker.off('error', onError);
          worker.off('exit', onExit);
          resolve(new DatabaseProxy(worker));
        }
      };
      const onError = (err: Error) => {
        console.error('[DatabaseProxy] worker error:', err.message);
        worker.off('message', onMessage);
        worker.off('exit', onExit);
        reject(err);
      };
      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);
    });
  }

  /** Send a request to the worker and return a Promise for the result. */
  private send(request: { type: string; [key: string]: unknown }): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Database proxy is closed'));
    const id = `req_${++requestCounter}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

  /** Call any method on AionUIDatabase by name. */
  call(method: string, ...args: unknown[]): Promise<unknown> {
    return this.send({ type: 'call', method, args });
  }

  /**
   * Execute raw SQL for callers that previously used getDriver().prepare().
   * Replaces the chained pattern: `db.getDriver().prepare(sql).run(...params)`
   * with: `await db.rawSql(sql, 'run', params)`
   */
  rawSql(sql: string, op: 'get' | 'all' | 'run', params: unknown[] = []): Promise<unknown> {
    return this.send({ type: 'rawSql', sql, op, params });
  }

  /** Graceful close — waits for the worker to confirm. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.send({ type: 'close' });
    await this.worker.terminate();
  }

  /** Synchronous close for process.on('exit') handlers. */
  closeSync(): void {
    if (this.closed) return;
    this.closed = true;
    // terminate() is synchronous in worker_threads — it signals the worker to
    // exit immediately.  The worker's own exit handler calls db.close().
    this.worker.terminate();
  }
}

/**
 * Mapped type that converts every public method of AionUIDatabase into an
 * async version returning a Promise.  Private and static members are excluded.
 */
type AsyncDatabase = {
  [K in keyof AionUIDatabase]: AionUIDatabase[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : AionUIDatabase[K];
};

/** The combined type callers see: typed async AionUIDatabase methods + rawSql helper. */
export type DatabaseInstance = AsyncDatabase & Pick<DatabaseProxy, 'rawSql' | 'close' | 'closeSync'>;

/**
 * Create a Proxy wrapper so callers can use `db.getConversation(id)` syntax
 * instead of `db.call('getConversation', id)`.  Every property access that is
 * not a known own method of DatabaseProxy returns an async function that
 * delegates to `call()`.  The return type preserves the original AionUIDatabase
 * method signatures (wrapped in Promise) for full type safety.
 */
export function createDatabaseProxy(proxy: DatabaseProxy): DatabaseInstance {
  return new Proxy(proxy, {
    get(target, prop, receiver) {
      // 'then' must return undefined so the Proxy is not treated as a thenable.
      // Without this, `await db.someMethod()` would try to call db.then()
      // and forward it to the worker as an unknown method, hanging forever.
      if (prop === 'then') return undefined;

      // Own methods (send, call, rawSql, close, closeSync) are used directly
      if (prop in target || typeof prop === 'symbol') {
        return Reflect.get(target, prop, receiver);
      }
      // Everything else is forwarded to the worker as a method call
      return (...args: unknown[]) => target.call(prop as string, ...args);
    },
  }) as unknown as DatabaseInstance;
}
