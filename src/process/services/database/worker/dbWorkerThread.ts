/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Database worker thread entry point.
 * Runs AionUIDatabase (better-sqlite3) in a dedicated thread so synchronous
 * SQLite operations do not block the Electron main process event loop.
 */

import { parentPort, workerData } from 'node:worker_threads';
import type { DbWorkerRequest, DbWorkerResponse } from './DatabaseWorkerProtocol';

if (!parentPort) {
  throw new Error('dbWorkerThread must be run as a worker_threads Worker');
}

const port = parentPort;

// Dynamic import so the heavy AionUIDatabase module is only loaded inside the worker
async function boot() {
  console.log('[dbWorker] booting, dbPath:', workerData.dbPath);
  const { AionUIDatabase } = await import('../index');
  const dbPath = workerData.dbPath as string;
  const db = await AionUIDatabase.create(dbPath);
  console.log('[dbWorker] database created, sending ready signal');

  // Signal ready
  port.postMessage({ id: '__boot__', type: 'ready' } satisfies DbWorkerResponse);
  console.log('[dbWorker] ready signal sent');

  port.on('message', (request: DbWorkerRequest) => {
    const { id } = request;
    try {
      if (request.type === 'close') {
        db.close();
        port.postMessage({ id, type: 'result', data: null } satisfies DbWorkerResponse);
        return;
      }

      if (request.type === 'rawSql') {
        const stmt = db.getDriver().prepare(request.sql);
        let result: unknown;
        if (request.op === 'get') result = stmt.get(...request.params);
        else if (request.op === 'all') result = stmt.all(...request.params);
        else result = stmt.run(...request.params);
        port.postMessage({ id, type: 'result', data: result } satisfies DbWorkerResponse);
        return;
      }

      // request.type === 'call'
      const method = request.method as keyof typeof db;
      const fn = db[method];
      if (typeof fn !== 'function') {
        port.postMessage({
          id,
          type: 'error',
          message: `Unknown method: ${request.method}`,
        } satisfies DbWorkerResponse);
        return;
      }
      const result = (fn as (...a: unknown[]) => unknown).apply(db, request.args);
      port.postMessage({ id, type: 'result', data: result } satisfies DbWorkerResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      port.postMessage({ id, type: 'error', message } satisfies DbWorkerResponse);
    }
  });
}

boot().catch((err) => {
  console.error('[dbWorkerThread] Fatal boot error:', err);
  process.exit(1);
});
