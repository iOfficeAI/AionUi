/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl index SQLite schema (indexer-01-03).
 * Verifies that initChislIndexSchema is idempotent and creates the required
 * tables with the documented uniqueness/FK constraints.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initChislIndexSchema, CHISL_INDEX_TABLES } from '@/process/services/indexer/schema';
import { openChislIndexStore, type ChislIndexStore } from '@/process/services/indexer/repository';

let store: ChislIndexStore;

beforeEach(() => {
  store = openChislIndexStore(':memory:');
});

afterEach(() => {
  store.close();
});

function listTables(): string[] {
  return (
    store.driver
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`)
      .all() as { name: string }[]
  ).map((row) => row.name);
}

function listIndexes(table: string): string[] {
  return (
    store.driver
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? ORDER BY name ASC`)
      .all(table) as { name: string }[]
  ).map((row) => row.name);
}

describe('initChislIndexSchema', () => {
  it('creates all required Chisl tables', () => {
    const tables = listTables();
    for (const expected of CHISL_INDEX_TABLES) {
      expect(tables).toContain(expected);
    }
  });

  it('is idempotent when invoked repeatedly', () => {
    initChislIndexSchema(store.driver);
    initChislIndexSchema(store.driver);
    const tables = listTables();
    for (const expected of CHISL_INDEX_TABLES) {
      expect(tables.filter((name) => name === expected)).toHaveLength(1);
    }
  });
});

describe('files table constraints', () => {
  it('enforces UNIQUE(path, workspace_root)', () => {
    store.driver
      .prepare(
        `INSERT INTO files (path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 1, 1)`
      )
      .run('/a.ts', 'ws1');

    expect(() =>
      store.driver
        .prepare(
          `INSERT INTO files (path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at)
           VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 2, 2)`
        )
        .run('/a.ts', 'ws1')
    ).toThrow();
  });

  it('allows the same path in different workspace roots', () => {
    expect(() =>
      store.driver
        .prepare(
          `INSERT INTO files (path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at)
           VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 1, 1)`
        )
        .run('/a.ts', 'ws1')
    ).not.toThrow();
    expect(() =>
      store.driver
        .prepare(
          `INSERT INTO files (path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at)
           VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 2, 2)`
        )
        .run('/a.ts', 'ws2')
    ).not.toThrow();
  });
});

describe('chunks table constraints', () => {
  function insertFile(): number {
    store.driver
      .prepare(
        `INSERT INTO files (path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 1, 1)`
      )
      .run('/a.ts', 'ws1');
    const row = store.driver
      .prepare(`SELECT id FROM files WHERE path = ? AND workspace_root = ?`)
      .get('/a.ts', 'ws1') as { id: number };
    return row.id;
  }

  it('enforces UNIQUE(file_id, chunk_index)', () => {
    const fileId = insertFile();
    store.driver
      .prepare(
        `INSERT INTO chunks (file_id, chunk_index, start_line, end_line, start_offset, end_offset, content_hash, created_at)
         VALUES (?, ?, 0, 1, 0, 1, NULL, 1)`
      )
      .run(fileId, 0);
    expect(() =>
      store.driver
        .prepare(
          `INSERT INTO chunks (file_id, chunk_index, start_line, end_line, start_offset, end_offset, content_hash, created_at)
           VALUES (?, ?, 0, 1, 0, 1, NULL, 1)`
        )
        .run(fileId, 0)
    ).toThrow();
  });

  it('cascades on file delete', () => {
    const fileId = insertFile();
    store.driver
      .prepare(
        `INSERT INTO chunks (file_id, chunk_index, start_line, end_line, start_offset, end_offset, content_hash, created_at)
         VALUES (?, ?, 0, 1, 0, 1, NULL, 1)`
      )
      .run(fileId, 0);
    store.driver.prepare(`DELETE FROM files WHERE id = ?`).run(fileId);
    const remaining = store.driver.prepare(`SELECT COUNT(*) AS c FROM chunks WHERE file_id = ?`).get(fileId) as {
      c: number;
    };
    expect(remaining.c).toBe(0);
  });

  it('exposes an index on file_id', () => {
    const indexes = listIndexes('chunks');
    expect(indexes).toContain('idx_chunks_file_id');
  });
});

describe('symbols table constraints', () => {
  function insertFile(): number {
    store.driver
      .prepare(
        `INSERT INTO files (path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 1, 1)`
      )
      .run('/a.ts', 'ws1');
    const row = store.driver
      .prepare(`SELECT id FROM files WHERE path = ? AND workspace_root = ?`)
      .get('/a.ts', 'ws1') as { id: number };
    return row.id;
  }

  it('enforces UNIQUE(file_id, name, line)', () => {
    const fileId = insertFile();
    store.driver
      .prepare(`INSERT INTO symbols (file_id, kind, name, line, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(fileId, 'function', 'foo', 10, 1);
    expect(() =>
      store.driver
        .prepare(`INSERT INTO symbols (file_id, kind, name, line, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(fileId, 'function', 'foo', 10, 1)
    ).toThrow();
  });

  it('allows the same symbol name on a different line', () => {
    const fileId = insertFile();
    expect(() =>
      store.driver
        .prepare(`INSERT INTO symbols (file_id, kind, name, line, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(fileId, 'function', 'foo', 10, 1)
    ).not.toThrow();
    expect(() =>
      store.driver
        .prepare(`INSERT INTO symbols (file_id, kind, name, line, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(fileId, 'function', 'foo', 11, 1)
    ).not.toThrow();
  });

  it('cascades on file delete', () => {
    const fileId = insertFile();
    store.driver
      .prepare(`INSERT INTO symbols (file_id, kind, name, line, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(fileId, 'function', 'foo', 10, 1);
    store.driver.prepare(`DELETE FROM files WHERE id = ?`).run(fileId);
    const remaining = store.driver.prepare(`SELECT COUNT(*) AS c FROM symbols WHERE file_id = ?`).get(fileId) as {
      c: number;
    };
    expect(remaining.c).toBe(0);
  });
});

describe('embeddings table constraints', () => {
  function insertFileAndChunk(): number {
    store.driver
      .prepare(
        `INSERT INTO files (path, workspace_root, content_hash, mtime_ms, size_bytes, language, indexed_at, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 1, 1)`
      )
      .run('/a.ts', 'ws1');
    const file = store.driver
      .prepare(`SELECT id FROM files WHERE path = ? AND workspace_root = ?`)
      .get('/a.ts', 'ws1') as { id: number };
    store.driver
      .prepare(
        `INSERT INTO chunks (file_id, chunk_index, start_line, end_line, start_offset, end_offset, content_hash, created_at)
         VALUES (?, 0, 0, 1, 0, 1, NULL, 1)`
      )
      .run(file.id);
    const chunk = store.driver.prepare(`SELECT id FROM chunks WHERE file_id = ?`).get(file.id) as { id: number };
    return chunk.id;
  }

  it('enforces UNIQUE(chunk_id, model)', () => {
    const chunkId = insertFileAndChunk();
    const blob = Buffer.from(new Float32Array([1, 2, 3]).buffer);
    store.driver
      .prepare(
        `INSERT INTO embeddings (chunk_id, model, dimensions, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(chunkId, 'm1', 3, blob, 1, 1);
    expect(() =>
      store.driver
        .prepare(
          `INSERT INTO embeddings (chunk_id, model, dimensions, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(chunkId, 'm1', 3, blob, 2, 2)
    ).toThrow();
  });

  it('cascades on chunk delete', () => {
    const chunkId = insertFileAndChunk();
    const blob = Buffer.from(new Float32Array([1, 2, 3]).buffer);
    store.driver
      .prepare(
        `INSERT INTO embeddings (chunk_id, model, dimensions, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(chunkId, 'm1', 3, blob, 1, 1);
    store.driver.prepare(`DELETE FROM chunks WHERE id = ?`).run(chunkId);
    const remaining = store.driver.prepare(`SELECT COUNT(*) AS c FROM embeddings WHERE chunk_id = ?`).get(chunkId) as {
      c: number;
    };
    expect(remaining.c).toBe(0);
  });
});
