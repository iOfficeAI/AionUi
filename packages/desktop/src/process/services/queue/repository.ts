/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import { initChislQueueSchema } from './schema';
import {
  CHISL_QUEUE_NON_TERMINAL_STATUSES,
  type ChislQueueItem,
  type ChislQueueItemCreate,
  type ChislQueueItemRow,
  type ChislQueueItemStatus,
  type ChislQueueItemUpdate,
} from './types';
import {
  chislQueueItemToRow,
  createDefaultChislQueueItemFields,
  DEFAULT_CHISL_QUEUE_MAX_RETRIES,
  rowToChislQueueItem,
} from './stateMachine';

export type ChislQueueStore = {
  driver: ISqliteDriver;
  close(): void;
};

function sessionCounterKey(sessionID: string | null): string {
  return sessionID ?? '__no_session__';
}

export function openChislQueueStore(dbPath: string): ChislQueueStore {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const driver = new BetterSqlite3Driver(dbPath);
  initChislQueueSchema(driver);
  return {
    driver,
    close: () => driver.close(),
  };
}

function allocateSessionOrder(store: ChislQueueStore, sessionID: string | null): number {
  const key = sessionCounterKey(sessionID);
  const tx = store.driver.transaction(() => {
    const existing = store.driver
      .prepare(`SELECT next_order FROM queue_session_counters WHERE session_key = ?`)
      .get(key) as { next_order: number } | undefined;
    if (!existing) {
      store.driver.prepare(`INSERT INTO queue_session_counters (session_key, next_order) VALUES (?, 1)`).run(key);
      return 0;
    }
    const order = existing.next_order;
    store.driver
      .prepare(`UPDATE queue_session_counters SET next_order = next_order + 1 WHERE session_key = ?`)
      .run(key);
    return order;
  });
  return tx() as number;
}

export function createChislQueueItem(store: ChislQueueStore, input: ChislQueueItemCreate): ChislQueueItem {
  const now = Date.now();
  const sessionOrder = input.session_order ?? allocateSessionOrder(store, input.session_id ?? null);
  const item = createDefaultChislQueueItemFields({
    id: input.id ?? randomUUID(),
    sessionID: input.session_id ?? null,
    messageID: input.message_id ?? null,
    commandType: input.command_type,
    payload: input.payload,
    sessionOrder,
    status: input.status ?? 'queued',
    maxRetries: input.max_retries ?? DEFAULT_CHISL_QUEUE_MAX_RETRIES,
    parentID: input.parent_id ?? null,
    metadata: input.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const row = chislQueueItemToRow(item);
  store.driver
    .prepare(
      `INSERT INTO queue_items (
        id, session_id, message_id, command_type, payload_json, session_order, status,
        created_at, updated_at, dispatched_at, completed_at, retry_count, max_retries,
        last_error, cancelled_by, cancelled_at, parent_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.session_id,
      row.message_id,
      row.command_type,
      row.payload_json,
      row.session_order,
      row.status,
      row.created_at,
      row.updated_at,
      row.dispatched_at,
      row.completed_at,
      row.retry_count,
      row.max_retries,
      row.last_error,
      row.cancelled_by,
      row.cancelled_at,
      row.parent_id,
      row.metadata_json
    );
  const loaded = getChislQueueItem(store, item.id);
  if (!loaded) {
    throw new Error('Failed to load queue item after insert');
  }
  return loaded;
}

export function getChislQueueItem(store: ChislQueueStore, id: string): ChislQueueItem | null {
  const row = store.driver
    .prepare(
      `SELECT id, session_id, message_id, command_type, payload_json, session_order, status,
              created_at, updated_at, dispatched_at, completed_at, retry_count, max_retries,
              last_error, cancelled_by, cancelled_at, parent_id, metadata_json
       FROM queue_items WHERE id = ?`
    )
    .get(id) as ChislQueueItemRow | undefined;
  return row ? rowToChislQueueItem(row) : null;
}

export function listChislQueueItems(store: ChislQueueStore, status?: ChislQueueItemStatus): ChislQueueItem[] {
  const baseSql = `SELECT id, session_id, message_id, command_type, payload_json, session_order, status,
              created_at, updated_at, dispatched_at, completed_at, retry_count, max_retries,
              last_error, cancelled_by, cancelled_at, parent_id, metadata_json
       FROM queue_items`;
  const rows = status
    ? (store.driver
        .prepare(`${baseSql} WHERE status = ? ORDER BY created_at ASC, session_order ASC`)
        .all(status) as ChislQueueItemRow[])
    : (store.driver.prepare(`${baseSql} ORDER BY created_at ASC, session_order ASC`).all() as ChislQueueItemRow[]);
  return rows.map(rowToChislQueueItem);
}

export function listNonTerminalChislQueueItems(store: ChislQueueStore): ChislQueueItem[] {
  const placeholders = CHISL_QUEUE_NON_TERMINAL_STATUSES.map(() => '?').join(', ');
  const rows = store.driver
    .prepare(
      `SELECT id, session_id, message_id, command_type, payload_json, session_order, status,
              created_at, updated_at, dispatched_at, completed_at, retry_count, max_retries,
              last_error, cancelled_by, cancelled_at, parent_id, metadata_json
       FROM queue_items WHERE status IN (${placeholders})
       ORDER BY created_at ASC, session_order ASC`
    )
    .all(...CHISL_QUEUE_NON_TERMINAL_STATUSES) as ChislQueueItemRow[];
  return rows.map(rowToChislQueueItem);
}

export function updateChislQueueItem(
  store: ChislQueueStore,
  id: string,
  update: ChislQueueItemUpdate
): ChislQueueItem | null {
  const existing = getChislQueueItem(store, id);
  if (!existing) {
    return null;
  }
  const next: ChislQueueItem = {
    ...existing,
    sessionID: update.session_id !== undefined ? update.session_id : existing.sessionID,
    messageID: update.message_id !== undefined ? update.message_id : existing.messageID,
    status: update.status ?? existing.status,
    dispatchedAt: update.dispatched_at !== undefined ? update.dispatched_at : existing.dispatchedAt,
    completedAt: update.completed_at !== undefined ? update.completed_at : existing.completedAt,
    retryCount: update.retry_count ?? existing.retryCount,
    maxRetries: update.max_retries ?? existing.maxRetries,
    lastError: update.last_error !== undefined ? update.last_error : existing.lastError,
    cancelledBy: update.cancelled_by !== undefined ? update.cancelled_by : existing.cancelledBy,
    cancelledAt: update.cancelled_at !== undefined ? update.cancelled_at : existing.cancelledAt,
    metadata: update.metadata !== undefined ? update.metadata : existing.metadata,
    updatedAt: Date.now(),
  };
  const row = chislQueueItemToRow(next);
  store.driver
    .prepare(
      `UPDATE queue_items SET
        session_id = ?, message_id = ?, status = ?, updated_at = ?,
        dispatched_at = ?, completed_at = ?, retry_count = ?, max_retries = ?,
        last_error = ?, cancelled_by = ?, cancelled_at = ?, metadata_json = ?
       WHERE id = ?`
    )
    .run(
      row.session_id,
      row.message_id,
      row.status,
      row.updated_at,
      row.dispatched_at,
      row.completed_at,
      row.retry_count,
      row.max_retries,
      row.last_error,
      row.cancelled_by,
      row.cancelled_at,
      row.metadata_json,
      id
    );
  return getChislQueueItem(store, id);
}

export function upsertChislQueueItem(store: ChislQueueStore, item: ChislQueueItem): ChislQueueItem {
  const row = chislQueueItemToRow(item);
  store.driver
    .prepare(
      `INSERT INTO queue_items (
        id, session_id, message_id, command_type, payload_json, session_order, status,
        created_at, updated_at, dispatched_at, completed_at, retry_count, max_retries,
        last_error, cancelled_by, cancelled_at, parent_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        message_id = excluded.message_id,
        command_type = excluded.command_type,
        payload_json = excluded.payload_json,
        session_order = excluded.session_order,
        status = excluded.status,
        updated_at = excluded.updated_at,
        dispatched_at = excluded.dispatched_at,
        completed_at = excluded.completed_at,
        retry_count = excluded.retry_count,
        max_retries = excluded.max_retries,
        last_error = excluded.last_error,
        cancelled_by = excluded.cancelled_by,
        cancelled_at = excluded.cancelled_at,
        parent_id = excluded.parent_id,
        metadata_json = excluded.metadata_json`
    )
    .run(
      row.id,
      row.session_id,
      row.message_id,
      row.command_type,
      row.payload_json,
      row.session_order,
      row.status,
      row.created_at,
      row.updated_at,
      row.dispatched_at,
      row.completed_at,
      row.retry_count,
      row.max_retries,
      row.last_error,
      row.cancelled_by,
      row.cancelled_at,
      row.parent_id,
      row.metadata_json
    );
  const loaded = getChislQueueItem(store, item.id);
  if (!loaded) {
    throw new Error('Failed to load queue item after upsert');
  }
  return loaded;
}

export function deleteChislQueueItem(store: ChislQueueStore, id: string): void {
  store.driver.prepare(`DELETE FROM queue_items WHERE id = ?`).run(id);
}
