/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for the database worker thread protocol.
 * Used by both dbWorkerThread.ts (worker side) and DatabaseProxy.ts (main side).
 */

/** Request sent from main thread → worker thread */
export type DbWorkerRequest =
  | { id: string; type: 'call'; method: string; args: unknown[] }
  | { id: string; type: 'rawSql'; sql: string; op: 'get' | 'all' | 'run'; params: unknown[] }
  | { id: string; type: 'close' };

/** Response sent from worker thread → main thread */
export type DbWorkerResponse =
  | { id: string; type: 'result'; data: unknown }
  | { id: string; type: 'error'; message: string }
  | { id: string; type: 'ready' };
