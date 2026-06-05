/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl indexer startup fallback scan.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openChislIndexStore,
  upsertFile,
  listIndexJobs,
  type ChislIndexStore,
} from '@/process/services/indexer/repository';
import { runStartupIndexScan } from '@/process/services/indexer/startupScan';
import type { IndexInvalidationOptions } from '@/process/services/indexer/invalidation';

let store: ChislIndexStore;
let workspaceRoot: string;
let options: IndexInvalidationOptions;

beforeEach(() => {
  store = openChislIndexStore(':memory:');
  workspaceRoot = mkdtempSync(path.join(tmpdir(), 'chisl-startup-'));
  options = { workspaceRoot };
});

afterEach(() => {
  store.close();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

function touch(relativePath: string, contents = ''): void {
  const absolute = path.join(workspaceRoot, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

describe('runStartupIndexScan', () => {
  it('schedules jobs for every file in a fresh workspace', async () => {
    touch('src/a.ts', 'a');
    touch('src/b.ts', 'b');
    touch('README.md', 'readme');

    const result = await runStartupIndexScan(store, options);
    expect(result.scanned).toBe(3);
    expect(result.jobsScheduled).toBe(3);
    expect(result.skippedIgnored).toBe(0);
    expect(result.skippedUnchanged).toBe(0);
    expect(listIndexJobs(store)).toHaveLength(3);
  });

  it('skips files that match the stored content hash (no job scheduled)', async () => {
    touch('src/stable.ts', 'stable');
    const first = await runStartupIndexScan(store, options);
    expect(first.jobsScheduled).toBe(1);

    const job = listIndexJobs(store)[0];
    const storedHash = JSON.parse(job.metadata_json ?? '{}').content_hash as string;
    upsertFile(store, {
      path: 'src/stable.ts',
      workspace_root: workspaceRoot,
      content_hash: storedHash,
    });
    listIndexJobs(store).forEach((j) => store.driver.prepare(`DELETE FROM index_jobs WHERE id = ?`).run(j.id));
    expect(listIndexJobs(store)).toHaveLength(0);

    const second = await runStartupIndexScan(store, options);
    expect(second.jobsScheduled).toBe(0);
    expect(second.skippedUnchanged).toBe(1);
  });

  it('schedules a job when the file content has changed', async () => {
    touch('src/edit.ts', 'v1');
    const first = await runStartupIndexScan(store, options);
    expect(first.jobsScheduled).toBe(1);

    writeFileSync(path.join(workspaceRoot, 'src/edit.ts'), 'v2');
    listIndexJobs(store).forEach((j) => store.driver.prepare(`DELETE FROM index_jobs WHERE id = ?`).run(j.id));

    const second = await runStartupIndexScan(store, options);
    expect(second.jobsScheduled).toBe(1);
  });

  it('skips ignored directories and files entirely', async () => {
    touch('src/keep.ts', 'keep');
    touch('node_modules/pkg/index.js', 'export {};');
    touch('dist/bundle.js', 'var x = 1;');
    touch('.env', 'SECRET=1');
    touch('.DS_Store', '');

    const result = await runStartupIndexScan(store, options);
    expect(result.scanned).toBe(1);
    expect(result.jobsScheduled).toBe(1);
    const jobs = listIndexJobs(store);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].file_path).toBe('src/keep.ts');
  });

  it('returns a clean result on an empty workspace', async () => {
    const result = await runStartupIndexScan(store, options);
    expect(result).toEqual({ scanned: 0, jobsScheduled: 0, skippedIgnored: 0, skippedUnchanged: 0 });
  });
});
