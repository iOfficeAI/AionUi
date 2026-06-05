/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';

export const CHISL_QUEUE_TABLES = ['queue_items', 'queue_session_counters'] as const;

export function initChislQueueSchema(db: ISqliteDriver): void {
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  try {
    db.pragma('journal_mode = WAL');
  } catch {
    // Continue with default journal mode if WAL fails.
  }

  db.exec(`CREATE TABLE IF NOT EXISTS queue_items (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    message_id TEXT,
    command_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    session_order INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    dispatched_at INTEGER,
    completed_at INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    cancelled_by TEXT,
    cancelled_at INTEGER,
    parent_id TEXT,
    metadata_json TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_queue_items_status ON queue_items(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_queue_items_session_id ON queue_items(session_id)');
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_queue_items_session_order ON queue_items(session_id, session_order)'
  );

  db.exec(`CREATE TABLE IF NOT EXISTS queue_session_counters (
    session_key TEXT PRIMARY KEY,
    next_order INTEGER NOT NULL DEFAULT 0
  )`);
}
