/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for Chisl indexer invalidation scheduling.
 */

import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openChislIndexStore,
  upsertFile,
  listIndexJobs,
  getFile,
  type ChislIndexStore,
} from '@/process/services/indexer/repository';
import {
  processFileChangeEvents,
  scheduleFileDeleteInvalidation,
  scheduleFileReindexIfChanged,
  type IndexInvalidationOptions,
} from '@/process/services/indexer/invalidation';

let store: ChislIndexStore;
let workspaceRoot: string;
let options: IndexInvalidationOptions;

beforeEach(() => {
  store = openChislIndexStore(':memory:');
  workspaceRoot = mkdtempSync(path.join(tmpdir(), 'chisl-invalidation-'));
  options = { workspaceRoot };
});

afterEach(() => {
  store.close();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

function writeFile(relativePath: string, contents: string): string {
  const absolute = path.join(workspaceRoot, relativePath);
  const dir = path.dirname(absolute);
  require('fs').mkdirSync(dir, { recursive: true });
  writeFileSync(absolute, contents);
  return absolute;
}

describe('scheduleFileReindexIfChanged', () => {
  it('schedules a reindex job for a new file', async () => {
    const absolute = writeFile('src/new.ts', 'export const x = 1;');
    const scheduled = await scheduleFileReindexIfChanged(store, options, 'src/new.ts', absolute);
    expect(scheduled).toBe(true);
    const jobs = listIndexJobs(store);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].kind).toBe('file');
    expect(jobs[0].file_path).toBe('src/new.ts');
    expect(jobs[0].workspace_root).toBe(workspaceRoot);
    expect(jobs[0].metadata_json).toContain('content_changed');
  });

  it('does not schedule a job when the content hash matches the stored one', async () => {
    const absolute = writeFile('src/stable.ts', 'stable');
    const first = await scheduleFileReindexIfChanged(store, options, 'src/stable.ts', absolute);
    // Persist the file row with the same hash the helper just computed.
    const jobs = listIndexJobs(store);
    expect(first).toBe(true);
    const hash = JSON.parse(jobs[0].metadata_json ?? '{}').content_hash as string;
    upsertFile(store, {
      path: 'src/stable.ts',
      workspace_root: workspaceRoot,
      content_hash: hash,
    });
    const second = await scheduleFileReindexIfChanged(store, options, 'src/stable.ts', absolute);
    expect(second).toBe(false);
    expect(listIndexJobs(store)).toHaveLength(1);
  });

  it('schedules a new job when the file content changes', async () => {
    const absolute = writeFile('src/edit.ts', 'v1');
    await scheduleFileReindexIfChanged(store, options, 'src/edit.ts', absolute);
    writeFileSync(absolute, 'v2');
    const scheduled = await scheduleFileReindexIfChanged(store, options, 'src/edit.ts', absolute);
    expect(scheduled).toBe(true);
    expect(listIndexJobs(store)).toHaveLength(2);
  });

  it('skips paths that should be ignored', async () => {
    const absolute = writeFile('node_modules/pkg/index.js', 'module.exports = {};');
    const scheduled = await scheduleFileReindexIfChanged(store, options, 'node_modules/pkg/index.js', absolute);
    expect(scheduled).toBe(false);
    expect(listIndexJobs(store)).toHaveLength(0);
  });

  it('returns false for non-existent files', async () => {
    const scheduled = await scheduleFileReindexIfChanged(
      store,
      options,
      'missing.ts',
      path.join(workspaceRoot, 'missing.ts')
    );
    expect(scheduled).toBe(false);
  });
});

describe('scheduleFileDeleteInvalidation', () => {
  it('removes the file row and schedules a delete job', () => {
    upsertFile(store, {
      path: 'src/gone.ts',
      workspace_root: workspaceRoot,
      content_hash: 'h',
    });
    const absolute = path.join(workspaceRoot, 'src/gone.ts');
    const scheduled = scheduleFileDeleteInvalidation(store, options, 'src/gone.ts', absolute);
    expect(scheduled).toBe(true);
    expect(getFile(store, 'src/gone.ts', workspaceRoot)).toBeNull();
    const jobs = listIndexJobs(store);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].file_path).toBe('src/gone.ts');
    expect(jobs[0].metadata_json).toContain('file_deleted');
  });

  it('is a no-op for files that were never indexed', () => {
    const scheduled = scheduleFileDeleteInvalidation(
      store,
      options,
      'src/never-indexed.ts',
      path.join(workspaceRoot, 'src/never-indexed.ts')
    );
    expect(scheduled).toBe(false);
    expect(listIndexJobs(store)).toHaveLength(0);
  });

  it('ignores paths that match ignore rules even if the row exists', () => {
    upsertFile(store, {
      path: 'node_modules/pkg/index.js',
      workspace_root: workspaceRoot,
      content_hash: 'h',
    });
    const scheduled = scheduleFileDeleteInvalidation(
      store,
      options,
      'node_modules/pkg/index.js',
      path.join(workspaceRoot, 'node_modules/pkg/index.js')
    );
    expect(scheduled).toBe(false);
    expect(getFile(store, 'node_modules/pkg/index.js', workspaceRoot)).not.toBeNull();
  });
});

describe('processFileChangeEvents', () => {
  it('processes a mixed batch of add, change, and delete events', async () => {
    const a = writeFile('src/a.ts', 'a');
    const b = writeFile('src/b.ts', 'b');
    upsertFile(store, {
      path: 'src/c.ts',
      workspace_root: workspaceRoot,
      content_hash: 'cHash',
    });

    const result = await processFileChangeEvents(store, options, [
      { relativePath: 'src/a.ts', absolutePath: a, kind: 'change' },
      { relativePath: 'src/b.ts', absolutePath: b, kind: 'change' },
      { relativePath: 'src/c.ts', absolutePath: path.join(workspaceRoot, 'src/c.ts'), kind: 'delete' },
    ]);
    expect(result.reindexScheduled).toBe(2);
    expect(result.deleteScheduled).toBe(1);
    expect(getFile(store, 'src/c.ts', workspaceRoot)).toBeNull();
  });

  it('deduplicates repeated change events for the same path', async () => {
    const a = writeFile('src/dup.ts', 'first');
    const result = await processFileChangeEvents(store, options, [
      { relativePath: 'src/dup.ts', absolutePath: a, kind: 'change' },
      { relativePath: 'src/dup.ts', absolutePath: a, kind: 'change' },
    ]);
    expect(result.reindexScheduled).toBe(1);
  });

  it('also drops duplicates where the on-disk file no longer exists', async () => {
    const absolute = writeFile('src/soon-gone.ts', 'tmp');
    unlinkSync(absolute);
    const result = await processFileChangeEvents(store, options, [
      { relativePath: 'src/soon-gone.ts', absolutePath: absolute, kind: 'change' },
    ]);
    expect(result.reindexScheduled).toBe(0);
  });
});
