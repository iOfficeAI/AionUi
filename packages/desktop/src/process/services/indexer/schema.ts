/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';

export const CHISL_INDEX_TABLES = ['files', 'chunks', 'symbols', 'embeddings', 'index_jobs'] as const;

export function initChislIndexSchema(db: ISqliteDriver): void {
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  try {
    db.pragma('journal_mode = WAL');
  } catch {
    // Continue with default journal mode if WAL fails.
  }

  db.exec(`CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    workspace_root TEXT NOT NULL,
    content_hash TEXT,
    mtime_ms INTEGER,
    size_bytes INTEGER,
    language TEXT,
    indexed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(path, workspace_root)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_files_workspace_root ON files(workspace_root)');

  db.exec(`CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    content_hash TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(file_id, chunk_index),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id)');

  db.exec(`CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    line INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(file_id, name, line),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id)');

  db.exec(`CREATE TABLE IF NOT EXISTS embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    vector BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(chunk_id, model),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id)');

  db.exec(`CREATE TABLE IF NOT EXISTS index_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    workspace_root TEXT,
    file_path TEXT,
    progress REAL NOT NULL DEFAULT 0,
    error_message TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_index_jobs_status ON index_jobs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_index_jobs_workspace_root ON index_jobs(workspace_root)');
}
