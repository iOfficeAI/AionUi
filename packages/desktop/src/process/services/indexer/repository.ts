/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import { initChislIndexSchema } from './schema';
import { serializeVector } from './vectors';
import type {
  IndexChunkInput,
  IndexChunkRow,
  IndexEmbeddingInput,
  IndexEmbeddingRow,
  IndexFileRow,
  IndexFileUpsert,
  IndexJobCreate,
  IndexJobRow,
  IndexJobStatus,
  IndexJobUpdate,
  IndexSymbolInput,
  IndexSymbolRow,
} from './types';

export type ChislIndexStore = {
  driver: ISqliteDriver;
  close(): void;
};

export function openChislIndexStore(dbPath: string): ChislIndexStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  const driver = new BetterSqlite3Driver(dbPath);
  initChislIndexSchema(driver);
  return {
    driver,
    close: () => driver.close(),
  };
}

export function upsertFile(store: ChislIndexStore, row: IndexFileUpsert): IndexFileRow {
  const now = Date.now();
  const indexedAt = row.indexed_at ?? now;
  store.driver
    .prepare(
      `INSERT INTO files (path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path, workspace_root) DO UPDATE SET
         content_hash = excluded.content_hash,
         mtime_ms = excluded.mtime_ms,
         size_bytes = excluded.size_bytes,
         language = excluded.language,
         indexed_at = excluded.indexed_at,
         updated_at = excluded.updated_at`
    )
    .run(
      row.path,
      row.workspace_root,
      row.content_hash ?? null,
      row.mtime_ms ?? null,
      row.size_bytes ?? null,
      row.language ?? null,
      indexedAt,
      now,
      now
    );
  const file = getFile(store, row.path, row.workspace_root);
  if (!file) {
    throw new Error('Failed to load file after upsert');
  }
  return file;
}

export function getFile(store: ChislIndexStore, path: string, workspaceRoot: string): IndexFileRow | null {
  const row = store.driver
    .prepare(
      `SELECT id, path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at
       FROM files WHERE path = ? AND workspace_root = ?`
    )
    .get(path, workspaceRoot) as IndexFileRow | undefined;
  return row ?? null;
}

export function listFiles(store: ChislIndexStore, workspaceRoot: string): IndexFileRow[] {
  return store.driver
    .prepare(
      `SELECT id, path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at
       FROM files WHERE workspace_root = ? ORDER BY path ASC`
    )
    .all(workspaceRoot) as IndexFileRow[];
}

export function deleteFile(store: ChislIndexStore, path: string, workspaceRoot: string): void {
  store.driver.prepare(`DELETE FROM files WHERE path = ? AND workspace_root = ?`).run(path, workspaceRoot);
}

export function replaceChunksForFile(store: ChislIndexStore, fileId: number, chunks: readonly IndexChunkInput[]): void {
  const tx = store.driver.transaction((items: readonly IndexChunkInput[]) => {
    store.driver.prepare(`DELETE FROM chunks WHERE file_id = ?`).run(fileId);
    const insert = store.driver.prepare(
      `INSERT INTO chunks (file_id, chunk_index, start_line, end_line, start_offset, end_offset, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = Date.now();
    for (const chunk of items) {
      insert.run(
        fileId,
        chunk.chunk_index,
        chunk.start_line,
        chunk.end_line,
        chunk.start_offset,
        chunk.end_offset,
        chunk.content_hash ?? null,
        now
      );
    }
  });
  tx(chunks);
}

export function listChunksForFile(store: ChislIndexStore, fileId: number): IndexChunkRow[] {
  return store.driver
    .prepare(
      `SELECT id, file_id, chunk_index, start_line, end_line, start_offset, end_offset, content_hash, created_at
       FROM chunks WHERE file_id = ? ORDER BY chunk_index ASC`
    )
    .all(fileId) as IndexChunkRow[];
}

export function replaceSymbolsForFile(store: ChislIndexStore, fileId: number, symbols: readonly IndexSymbolInput[]): void {
  const tx = store.driver.transaction((items: readonly IndexSymbolInput[]) => {
    store.driver.prepare(`DELETE FROM symbols WHERE file_id = ?`).run(fileId);
    const insert = store.driver.prepare(
      `INSERT INTO symbols (file_id, kind, name, line, created_at) VALUES (?, ?, ?, ?, ?)`
    );
    const now = Date.now();
    for (const symbol of items) {
      insert.run(fileId, symbol.kind, symbol.name, symbol.line, now);
    }
  });
  tx(symbols);
}

export function listSymbolsForFile(store: ChislIndexStore, fileId: number): IndexSymbolRow[] {
  return store.driver
    .prepare(`SELECT id, file_id, kind, name, line, created_at FROM symbols WHERE file_id = ? ORDER BY line ASC, name ASC`)
    .all(fileId) as IndexSymbolRow[];
}

export function upsertEmbedding(store: ChislIndexStore, input: IndexEmbeddingInput): IndexEmbeddingRow {
  const now = Date.now();
  const blob = serializeVector(input.vector);
  store.driver
    .prepare(
      `INSERT INTO embeddings (chunk_id, model, dimensions, vector, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chunk_id, model) DO UPDATE SET
         dimensions = excluded.dimensions,
         vector = excluded.vector,
         updated_at = excluded.updated_at`
    )
    .run(input.chunk_id, input.model, input.vector.length, blob, now, now);
  const row = store.driver
    .prepare(
      `SELECT id, chunk_id, model, dimensions, vector, created_at, updated_at
       FROM embeddings WHERE chunk_id = ? AND model = ?`
    )
    .get(input.chunk_id, input.model) as IndexEmbeddingRow | undefined;
  if (!row) {
    throw new Error('Failed to load embedding after upsert');
  }
  return row;
}

export function listEmbeddingsForChunk(store: ChislIndexStore, chunkId: number): IndexEmbeddingRow[] {
  return store.driver
    .prepare(
      `SELECT id, chunk_id, model, dimensions, vector, created_at, updated_at
       FROM embeddings WHERE chunk_id = ? ORDER BY model ASC`
    )
    .all(chunkId) as IndexEmbeddingRow[];
}

export function createIndexJob(store: ChislIndexStore, job: IndexJobCreate): IndexJobRow {
  const now = Date.now();
  const result = store.driver
    .prepare(
      `INSERT INTO index_jobs (kind, status, workspace_root, file_path, progress, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .run(job.kind, 'pending', job.workspace_root ?? null, job.file_path ?? null, job.metadata_json ?? null, now, now);
  const jobRow = getIndexJob(store, Number(result.lastInsertRowid));
  if (!jobRow) {
    throw new Error('Failed to load index job after insert');
  }
  return jobRow;
}

export function updateIndexJob(store: ChislIndexStore, id: number, update: IndexJobUpdate): IndexJobRow | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (update.status !== undefined) {
    fields.push('status = ?');
    values.push(update.status);
  }
  if (update.progress !== undefined) {
    fields.push('progress = ?');
    values.push(update.progress);
  }
  if (update.error_message !== undefined) {
    fields.push('error_message = ?');
    values.push(update.error_message);
  }
  if (update.metadata_json !== undefined) {
    fields.push('metadata_json = ?');
    values.push(update.metadata_json);
  }
  if (update.started_at !== undefined) {
    fields.push('started_at = ?');
    values.push(update.started_at);
  }
  if (update.finished_at !== undefined) {
    fields.push('finished_at = ?');
    values.push(update.finished_at);
  }
  if (fields.length === 0) {
    return getIndexJob(store, id);
  }
  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);
  store.driver.prepare(`UPDATE index_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getIndexJob(store, id);
}

export function getIndexJob(store: ChislIndexStore, id: number): IndexJobRow | null {
  const row = store.driver
    .prepare(
      `SELECT id, kind, status, workspace_root, file_path, progress, error_message, metadata_json,
              created_at, updated_at, started_at, finished_at
       FROM index_jobs WHERE id = ?`
    )
    .get(id) as IndexJobRow | undefined;
  return row ?? null;
}

export function listIndexJobs(store: ChislIndexStore, status?: IndexJobStatus): IndexJobRow[] {
  if (status) {
    return store.driver
      .prepare(
        `SELECT id, kind, status, workspace_root, file_path, progress, error_message, metadata_json,
                created_at, updated_at, started_at, finished_at
         FROM index_jobs WHERE status = ? ORDER BY created_at ASC`
      )
      .all(status) as IndexJobRow[];
  }
  return store.driver
    .prepare(
      `SELECT id, kind, status, workspace_root, file_path, progress, error_message, metadata_json,
              created_at, updated_at, started_at, finished_at
       FROM index_jobs ORDER BY created_at ASC`
    )
    .all() as IndexJobRow[];
}
