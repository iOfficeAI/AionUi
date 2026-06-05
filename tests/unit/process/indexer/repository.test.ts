/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl index repository functions (indexer-01-03).
 * Uses an in-memory SQLite database so the actual schema and SQL run.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHISL_INDEX_TABLES,
  initChislIndexSchema,
} from '@/process/services/indexer/schema';
import {
  createIndexJob,
  deleteFile,
  getFile,
  getIndexJob,
  listChunksForFile,
  listEmbeddingsForChunk,
  listFiles,
  listIndexJobs,
  listSymbolsForFile,
  openChislIndexStore,
  replaceChunksForFile,
  replaceSymbolsForFile,
  updateIndexJob,
  upsertEmbedding,
  upsertFile,
  type ChislIndexStore,
} from '@/process/services/indexer/repository';
import { deserializeVector } from '@/process/services/indexer/vectors';

let store: ChislIndexStore;

beforeEach(() => {
  store = openChislIndexStore(':memory:');
});

afterEach(() => {
  store.close();
});

function listTableNames(): string[] {
  return (store.driver
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[]).map((row) => row.name);
}

describe('openChislIndexStore', () => {
  it('initializes the schema on open', () => {
    const tables = listTableNames();
    for (const expected of CHISL_INDEX_TABLES) {
      expect(tables).toContain(expected);
    }
  });

  it('initializing twice leaves schema unchanged (idempotent)', () => {
    initChislIndexSchema(store.driver);
    const tables = listTableNames();
    const counts = new Map<string, number>();
    for (const t of tables) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [, count] of counts) {
      expect(count).toBe(1);
    }
  });
});

describe('upsertFile', () => {
  it('inserts a new file row and returns it', () => {
    const inserted = upsertFile(store, {
      path: '/a.ts',
      workspace_root: 'ws1',
      content_hash: 'h1',
      mtime_ms: 100,
      size_bytes: 12,
      language: 'typescript',
    });
    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.path).toBe('/a.ts');
    expect(inserted.workspace_root).toBe('ws1');
    expect(inserted.content_hash).toBe('h1');
  });

  it('updates an existing row on the same (path, workspace_root)', () => {
    const first = upsertFile(store, {
      path: '/a.ts',
      workspace_root: 'ws1',
      content_hash: 'h1',
    });
    const second = upsertFile(store, {
      path: '/a.ts',
      workspace_root: 'ws1',
      content_hash: 'h2',
    });
    expect(second.id).toBe(first.id);
    expect(second.content_hash).toBe('h2');
  });

  it('keeps separate rows for distinct (path, workspace_root)', () => {
    const a = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    const b = upsertFile(store, { path: '/a.ts', workspace_root: 'ws2' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('listFiles / getFile / deleteFile', () => {
  it('returns null for missing files', () => {
    expect(getFile(store, '/missing.ts', 'ws1')).toBeNull();
  });

  it('lists files scoped to a workspace root', () => {
    upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    upsertFile(store, { path: '/b.ts', workspace_root: 'ws1' });
    upsertFile(store, { path: '/a.ts', workspace_root: 'ws2' });

    const ws1 = listFiles(store, 'ws1').map((row) => row.path).sort();
    const ws2 = listFiles(store, 'ws2').map((row) => row.path);

    expect(ws1).toEqual(['/a.ts', '/b.ts']);
    expect(ws2).toEqual(['/a.ts']);
  });

  it('deleteFile removes the row', () => {
    upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    deleteFile(store, '/a.ts', 'ws1');
    expect(getFile(store, '/a.ts', 'ws1')).toBeNull();
  });
});

describe('replaceChunksForFile / listChunksForFile', () => {
  it('replaces existing chunks for a file', () => {
    const file = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    replaceChunksForFile(store, file.id, [
      { chunk_index: 0, start_line: 0, end_line: 1, start_offset: 0, end_offset: 1 },
      { chunk_index: 1, start_line: 1, end_line: 2, start_offset: 1, end_offset: 2 },
    ]);
    expect(listChunksForFile(store, file.id)).toHaveLength(2);

    replaceChunksForFile(store, file.id, [
      { chunk_index: 0, start_line: 0, end_line: 5, start_offset: 0, end_offset: 5 },
    ]);
    const chunks = listChunksForFile(store, file.id);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].end_line).toBe(5);
  });

  it('returns chunks in chunk_index order', () => {
    const file = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    replaceChunksForFile(store, file.id, [
      { chunk_index: 2, start_line: 0, end_line: 1, start_offset: 0, end_offset: 1 },
      { chunk_index: 0, start_line: 1, end_line: 2, start_offset: 1, end_offset: 2 },
      { chunk_index: 1, start_line: 2, end_line: 3, start_offset: 2, end_offset: 3 },
    ]);
    const indexes = listChunksForFile(store, file.id).map((c) => c.chunk_index);
    expect(indexes).toEqual([0, 1, 2]);
  });

  it('cascades chunks on file delete', () => {
    const file = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    replaceChunksForFile(store, file.id, [
      { chunk_index: 0, start_line: 0, end_line: 1, start_offset: 0, end_offset: 1 },
    ]);
    deleteFile(store, '/a.ts', 'ws1');
    const remaining = store.driver
      .prepare(`SELECT COUNT(*) AS c FROM chunks WHERE file_id = ?`)
      .get(file.id) as { c: number };
    expect(remaining.c).toBe(0);
  });
});

describe('replaceSymbolsForFile / listSymbolsForFile', () => {
  it('replaces existing symbols for a file', () => {
    const file = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    replaceSymbolsForFile(store, file.id, [
      { kind: 'function', name: 'foo', line: 1 },
      { kind: 'class', name: 'Bar', line: 10 },
    ]);
    expect(listSymbolsForFile(store, file.id)).toHaveLength(2);

    replaceSymbolsForFile(store, file.id, [{ kind: 'function', name: 'baz', line: 5 }]);
    const symbols = listSymbolsForFile(store, file.id);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('baz');
  });

  it('accepts every approved symbol kind', () => {
    const file = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    const kinds = [
      'function',
      'class',
      'interface',
      'type',
      'const',
      'method',
      'struct',
      'enum',
      'rule',
    ] as const;
    replaceSymbolsForFile(
      store,
      file.id,
      kinds.map((kind, i) => ({ kind, name: `${kind}_${i}`, line: i + 1 }))
    );
    const stored = listSymbolsForFile(store, file.id);
    expect(stored.map((s) => s.kind)).toEqual([...kinds]);
  });

  it('returns symbols ordered by line, then name', () => {
    const file = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    replaceSymbolsForFile(store, file.id, [
      { kind: 'function', name: 'b', line: 5 },
      { kind: 'function', name: 'a', line: 5 },
      { kind: 'function', name: 'c', line: 1 },
    ]);
    const symbols = listSymbolsForFile(store, file.id);
    expect(symbols.map((s) => `${s.line}:${s.name}`)).toEqual(['1:c', '5:a', '5:b']);
  });

  it('cascades symbols on file delete', () => {
    const file = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    replaceSymbolsForFile(store, file.id, [{ kind: 'function', name: 'foo', line: 1 }]);
    deleteFile(store, '/a.ts', 'ws1');
    const remaining = store.driver
      .prepare(`SELECT COUNT(*) AS c FROM symbols WHERE file_id = ?`)
      .get(file.id) as { c: number };
    expect(remaining.c).toBe(0);
  });
});

describe('upsertEmbedding / listEmbeddingsForChunk', () => {
  function makeFileAndChunk(): { fileId: number; chunkId: number } {
    const file = upsertFile(store, { path: '/a.ts', workspace_root: 'ws1' });
    replaceChunksForFile(store, file.id, [
      { chunk_index: 0, start_line: 0, end_line: 1, start_offset: 0, end_offset: 1 },
    ]);
    const chunk = store.driver
      .prepare(`SELECT id FROM chunks WHERE file_id = ?`)
      .get(file.id) as { id: number };
    return { fileId: file.id, chunkId: chunk.id };
  }

  it('stores a Float32Array and round-trips via deserializeVector', () => {
    const { chunkId } = makeFileAndChunk();
    const input = new Float32Array([0.1, 0.2, 0.3, -0.4]);
    upsertEmbedding(store, { chunk_id: chunkId, model: 'm1', vector: input });

    const rows = listEmbeddingsForChunk(store, chunkId);
    expect(rows).toHaveLength(1);
    expect(rows[0].dimensions).toBe(4);

    const decoded = deserializeVector(rows[0].vector, rows[0].dimensions);
    expect(Array.from(decoded)).toEqual(Array.from(input));
  });

  it('updates an existing embedding for the same (chunk_id, model)', () => {
    const { chunkId } = makeFileAndChunk();
    upsertEmbedding(store, { chunk_id: chunkId, model: 'm1', vector: new Float32Array([1, 2, 3]) });
    upsertEmbedding(store, { chunk_id: chunkId, model: 'm1', vector: new Float32Array([4, 5, 6]) });
    const rows = listEmbeddingsForChunk(store, chunkId);
    expect(rows).toHaveLength(1);
    const decoded = deserializeVector(rows[0].vector, rows[0].dimensions);
    expect(Array.from(decoded)).toEqual([4, 5, 6]);
  });

  it('keeps separate rows per model', () => {
    const { chunkId } = makeFileAndChunk();
    upsertEmbedding(store, { chunk_id: chunkId, model: 'm1', vector: new Float32Array([1, 2]) });
    upsertEmbedding(store, { chunk_id: chunkId, model: 'm2', vector: new Float32Array([3, 4]) });
    const rows = listEmbeddingsForChunk(store, chunkId);
    expect(rows.map((r) => r.model).sort()).toEqual(['m1', 'm2']);
  });

  it('cascades embeddings on chunk delete', () => {
    const { chunkId } = makeFileAndChunk();
    upsertEmbedding(store, { chunk_id: chunkId, model: 'm1', vector: new Float32Array([1, 2]) });
    store.driver.prepare(`DELETE FROM chunks WHERE id = ?`).run(chunkId);
    const remaining = store.driver
      .prepare(`SELECT COUNT(*) AS c FROM embeddings WHERE chunk_id = ?`)
      .get(chunkId) as { c: number };
    expect(remaining.c).toBe(0);
  });
});

describe('createIndexJob / updateIndexJob / listIndexJobs', () => {
  it('creates a new pending job and lists it', () => {
    const job = createIndexJob(store, {
      kind: 'full_workspace',
      workspace_root: 'ws1',
    });
    expect(job.status).toBe('pending');
    expect(job.progress).toBe(0);
    expect(listIndexJobs(store)).toHaveLength(1);
  });

  it('updates a job status, progress, and error message', () => {
    const job = createIndexJob(store, { kind: 'file', file_path: '/a.ts' });
    const running = updateIndexJob(store, job.id, {
      status: 'running',
      progress: 0.5,
      started_at: 1234,
    });
    expect(running?.status).toBe('running');
    expect(running?.progress).toBe(0.5);
    expect(running?.started_at).toBe(1234);

    const failed = updateIndexJob(store, job.id, {
      status: 'failed',
      progress: 0.5,
      error_message: 'boom',
      finished_at: 5678,
    });
    expect(failed?.status).toBe('failed');
    expect(failed?.error_message).toBe('boom');
    expect(failed?.finished_at).toBe(5678);
  });

  it('filters listIndexJobs by status', () => {
    const a = createIndexJob(store, { kind: 'file', file_path: '/a.ts' });
    createIndexJob(store, { kind: 'file', file_path: '/b.ts' });
    updateIndexJob(store, a.id, { status: 'running' });
    const running = listIndexJobs(store, 'running');
    expect(running.map((j) => j.id)).toEqual([a.id]);
  });

  it('returns null for unknown job id', () => {
    expect(getIndexJob(store, 99999)).toBeNull();
  });

  it('updates metadata_json and round-trips it', () => {
    const job = createIndexJob(store, { kind: 'embedding' });
    const updated = updateIndexJob(store, job.id, { metadata_json: '{"k":"v"}' });
    expect(updated?.metadata_json).toBe('{"k":"v"}');
  });

  it('no-op update returns the existing job unchanged', () => {
    const job = createIndexJob(store, { kind: 'file' });
    const result = updateIndexJob(store, job.id, {});
    expect(result?.id).toBe(job.id);
  });
});
