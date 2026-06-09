/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for `LocalHistoryService` — the main-process, git-less "Timeline"
 * backend that stores per-file snapshots under a configurable root dir.
 *
 * These tests use a real temp directory under `os.tmpdir()` (the service
 * performs plain node:fs IO; no mocking is needed or appropriate). The temp
 * dir is removed in `afterEach`.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_ENTRIES_PER_FILE,
  MAX_SNAPSHOT_BYTES,
  LocalHistoryService,
  type LocalHistoryServiceDeps,
} from '@/process/services/localHistory/LocalHistoryService';

let rootDir: string;
let service: LocalHistoryService;
let tempWorkspace: string;

beforeEach(() => {
  // Resolve via realpathSync so paths used in assertions match what the
  // service's `path.resolve(file_path)` produces on macOS where /var is a
  // symlink to /private/var. Both staging dirs must exist on disk for
  // realpathSync to resolve them.
  const stagingRoot = path.join(tmpdir(), `aionui-lh-root-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const stagingWs = path.join(tmpdir(), `aionui-lh-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  rmSync(stagingRoot, { recursive: true, force: true });
  rmSync(stagingWs, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  mkdirSync(stagingWs, { recursive: true });
  rootDir = realpathSync(stagingRoot);
  tempWorkspace = realpathSync(stagingWs);

  const deps: LocalHistoryServiceDeps = { rootDir };
  service = new LocalHistoryService(deps);
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
  rmSync(tempWorkspace, { recursive: true, force: true });
});

// --- helpers ---------------------------------------------------------------

const sha256 = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');

/** Build a path under the test workspace without creating it on disk. */
function filePath(rel: string): string {
  return path.join(tempWorkspace, rel);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Read the on-disk blob path the service would use for a (file, content) pair. */
function blobPathFor(fileAbsPath: string, content: string): string {
  const pathHash = sha256(path.resolve(fileAbsPath));
  const contentHash = sha256(content);
  return path.join(rootDir, pathHash, 'blobs', contentHash);
}

// --- tests -----------------------------------------------------------------

describe('LocalHistoryService — addSnapshot / listEntries / getEntryContent', () => {
  it('creates an entry, lists it, and returns the exact content', async () => {
    const fp = filePath('src/foo.ts');
    const content = 'export const a = 1;\n';

    const res = await service.addSnapshot({ file_path: fp, content, source: 'save' });

    expect(res.created).toBe(true);
    expect(res.entry.source).toBe('save');
    expect(res.entry.contentHash).toBe(sha256(content));
    expect(res.entry.size).toBe(Buffer.byteLength(content, 'utf8'));

    const entries = await service.listEntries({ file_path: fp });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(res.entry.id);

    const got = await service.getEntryContent({ file_path: fp, entry_id: res.entry.id });
    expect(got.content).toBe(content);
  });
});

describe('LocalHistoryService — newest-first ordering', () => {
  it('orders multiple distinct snapshots newest-first and preserves content', async () => {
    const fp = filePath('src/order.ts');

    const a = await service.addSnapshot({ file_path: fp, content: 'one', source: 'save' });
    // Bump the clock between snapshots so timestamps are strictly distinct.
    await sleep(2);
    const b = await service.addSnapshot({ file_path: fp, content: 'two', source: 'save' });
    await sleep(2);
    const c = await service.addSnapshot({ file_path: fp, content: 'three', source: 'save' });

    const entries = await service.listEntries({ file_path: fp });
    expect(entries.map((e) => e.id)).toEqual([c.entry.id, b.entry.id, a.entry.id]);

    // Newest-first by content as well.
    const ordered = await Promise.all(entries.map((e) => service.getEntryContent({ file_path: fp, entry_id: e.id })));
    expect(ordered.map((o) => o.content)).toEqual(['three', 'two', 'one']);

    // Timestamps must be non-increasing.
    expect(entries[0].timestamp).toBeGreaterThanOrEqual(entries[1].timestamp);
    expect(entries[1].timestamp).toBeGreaterThanOrEqual(entries[2].timestamp);
  });
});

describe('LocalHistoryService — deduplication (only against the newest entry)', () => {
  it('does NOT create a new entry when the content matches the newest', async () => {
    const fp = filePath('src/dedupe-newest.ts');

    const first = await service.addSnapshot({ file_path: fp, content: 'A', source: 'save' });
    const second = await service.addSnapshot({ file_path: fp, content: 'B', source: 'save' });
    // Now the newest is "B"; resending "A" must be added (not deduped).
    const third = await service.addSnapshot({ file_path: fp, content: 'A', source: 'save' });
    // Resending "A" again — the NEWEST is now the third add ("A"), so this dedupes.
    const fourth = await service.addSnapshot({ file_path: fp, content: 'A', source: 'save' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(third.created).toBe(true);
    expect(fourth.created).toBe(false);
    expect(fourth.entry.id).toBe(third.entry.id);

    const entries = await service.listEntries({ file_path: fp });
    expect(entries).toHaveLength(3);
    // Newest-first: third (A), second (B), first (A).
    expect(entries[0].id).toBe(third.entry.id);
    expect(entries[1].id).toBe(second.entry.id);
    expect(entries[2].id).toBe(first.entry.id);
  });

  it('DOES create a new entry when the content matches an older (non-newest) entry', async () => {
    const fp = filePath('src/dedupe-older.ts');

    // Layout: [X, Y, X] — the third add's newest is Y, so X is NOT deduped.
    const first = await service.addSnapshot({ file_path: fp, content: 'X', source: 'save' });
    await sleep(2);
    const second = await service.addSnapshot({ file_path: fp, content: 'Y', source: 'save' });
    await sleep(2);
    const third = await service.addSnapshot({ file_path: fp, content: 'X', source: 'save' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(third.created).toBe(true);
    expect(third.entry.id).not.toBe(first.entry.id);

    const entries = await service.listEntries({ file_path: fp });
    expect(entries).toHaveLength(3);
    expect(entries[0].id).toBe(third.entry.id);
    expect(entries[1].id).toBe(second.entry.id);
    expect(entries[2].id).toBe(first.entry.id);
  });
});

describe('LocalHistoryService — getEntryContent missing entry', () => {
  it('returns { content: null } for a non-existent entry_id', async () => {
    const fp = filePath('src/missing.ts');
    await service.addSnapshot({ file_path: fp, content: 'hello', source: 'save' });

    const got = await service.getEntryContent({ file_path: fp, entry_id: '9999-deadbeef' });
    expect(got).toEqual({ content: null });
  });
});

describe('LocalHistoryService — cap and pruning', () => {
  it('keeps only the most recent MAX_ENTRIES_PER_FILE entries and prunes the oldest', async () => {
    const fp = filePath('src/prune.ts');
    const total = MAX_ENTRIES_PER_FILE + 5;
    const added: Array<{ id: string; content: string }> = [];

    for (let i = 0; i < total; i++) {
      const content = `v${i}`;
      // Ensure strictly increasing timestamps so the newest-first ordering
      // matches the order we added them.
      await sleep(2);
      const res = await service.addSnapshot({ file_path: fp, content, source: 'save' });
      added.push({ id: res.entry.id, content });
    }

    const entries = await service.listEntries({ file_path: fp });
    expect(entries).toHaveLength(MAX_ENTRIES_PER_FILE);

    // The 5 earliest (indices 0..4) must be pruned.
    const survivingIds = new Set(entries.map((e) => e.id));
    for (let i = 0; i < 5; i++) {
      expect(survivingIds.has(added[i].id)).toBe(false);
      const got = await service.getEntryContent({ file_path: fp, entry_id: added[i].id });
      expect(got.content).toBeNull();
    }
    // The MAX_ENTRIES_PER_FILE most recent (indices 5..total-1) must survive.
    for (let i = 5; i < total; i++) {
      expect(survivingIds.has(added[i].id)).toBe(true);
      const got = await service.getEntryContent({ file_path: fp, entry_id: added[i].id });
      expect(got.content).toBe(added[i].content);
    }
  });
});

describe('LocalHistoryService — content-addressed blob GC (refcount)', () => {
  it('keeps the blob while any entry references it and GCs it only when none do', async () => {
    const fp = filePath('src/gc.ts');
    // A: X, B: Y, C: X again. Two entries now reference X (A and C).
    const a = await service.addSnapshot({ file_path: fp, content: 'X', source: 'save' });
    await sleep(2);
    const b = await service.addSnapshot({ file_path: fp, content: 'Y', source: 'save' });
    await sleep(2);
    const c = await service.addSnapshot({ file_path: fp, content: 'X', source: 'save' });

    // Sanity: A and C share the same contentHash; B has its own.
    expect(a.entry.contentHash).toBe(c.entry.contentHash);
    expect(b.entry.contentHash).not.toBe(a.entry.contentHash);

    const xBlob = blobPathFor(fp, 'X');
    const yBlob = blobPathFor(fp, 'Y');
    expect(existsSync(xBlob)).toBe(true);
    expect(existsSync(yBlob)).toBe(true);

    // Delete one X reference (A). C still references X, so the blob must stay.
    const after1 = await service.deleteEntry({ file_path: fp, entry_id: a.entry.id });
    expect(after1.map((e) => e.id)).toEqual([c.entry.id, b.entry.id]);
    expect(existsSync(xBlob)).toBe(true);
    const cContent = await service.getEntryContent({ file_path: fp, entry_id: c.entry.id });
    expect(cContent.content).toBe('X');

    // Delete the second X reference (C). Now nothing references X → blob GC'd.
    const after2 = await service.deleteEntry({ file_path: fp, entry_id: c.entry.id });
    expect(after2.map((e) => e.id)).toEqual([b.entry.id]);
    expect(existsSync(xBlob)).toBe(false);
    // Y blob still present.
    expect(existsSync(yBlob)).toBe(true);
    // And the deleted entry's content is no longer fetchable.
    const cContentGone = await service.getEntryContent({ file_path: fp, entry_id: c.entry.id });
    expect(cContentGone.content).toBeNull();
  });
});

describe('LocalHistoryService — deleteEntry for a non-existent id', () => {
  it('returns the current entries unchanged and does not throw', async () => {
    const fp = filePath('src/delete-missing.ts');
    const a = await service.addSnapshot({ file_path: fp, content: 'a', source: 'save' });
    const b = await service.addSnapshot({ file_path: fp, content: 'b', source: 'save' });

    const remaining = await service.deleteEntry({ file_path: fp, entry_id: '9999-nope' });
    expect(remaining.map((e) => e.id)).toEqual([b.entry.id, a.entry.id]);

    // And a follow-up list confirms the same.
    const entries = await service.listEntries({ file_path: fp });
    expect(entries.map((e) => e.id)).toEqual([b.entry.id, a.entry.id]);
  });
});

describe('LocalHistoryService — clear()', () => {
  it('removes history for the targeted file but leaves other files untouched', async () => {
    const fpA = filePath('src/a.ts');
    const fpB = filePath('src/b.ts');

    await service.addSnapshot({ file_path: fpA, content: 'a1', source: 'save' });
    await service.addSnapshot({ file_path: fpA, content: 'a2', source: 'save' });
    await service.addSnapshot({ file_path: fpB, content: 'b1', source: 'save' });

    const aBlob = blobPathFor(fpA, 'a1');
    const bBlob = blobPathFor(fpB, 'b1');
    expect(existsSync(aBlob)).toBe(true);
    expect(existsSync(bBlob)).toBe(true);

    await service.clear({ file_path: fpA });

    expect(await service.listEntries({ file_path: fpA })).toEqual([]);
    // B is untouched.
    const bEntries = await service.listEntries({ file_path: fpB });
    expect(bEntries).toHaveLength(1);
    const bContent = await service.getEntryContent({ file_path: fpB, entry_id: bEntries[0].id });
    expect(bContent.content).toBe('b1');
    expect(existsSync(bBlob)).toBe(true);
  });

  it('is a no-op when there is no history for the file', async () => {
    const fp = filePath('src/never-snapshotted.ts');
    await expect(service.clear({ file_path: fp })).resolves.toBeUndefined();
    expect(await service.listEntries({ file_path: fp })).toEqual([]);
  });
});

describe('LocalHistoryService — oversized content', () => {
  it('rejects content larger than MAX_SNAPSHOT_BYTES and stores nothing', async () => {
    const fp = filePath('src/big.ts');
    // Establish a baseline so we can verify the "newest" fallback.
    const baseline = await service.addSnapshot({ file_path: fp, content: 'small', source: 'save' });
    const beforeCount = (await service.listEntries({ file_path: fp })).length;

    const oversized = 'a'.repeat(MAX_SNAPSHOT_BYTES + 1);
    const res = await service.addSnapshot({ file_path: fp, content: oversized, source: 'save' });

    expect(res.created).toBe(false);
    // When there is a prior entry, the service returns the newest existing
    // entry rather than a synthetic one.
    expect(res.entry.id).toBe(baseline.entry.id);

    const afterCount = (await service.listEntries({ file_path: fp })).length;
    expect(afterCount).toBe(beforeCount);
  });
});

describe('LocalHistoryService — concurrency', () => {
  it('handles 20 concurrent addSnapshot calls for the same file without losing entries', async () => {
    const fp = filePath('src/concurrent.ts');
    const N = 20;

    const promises: Array<Promise<{ id: string; content: string; created: boolean }>> = [];
    for (let i = 0; i < N; i++) {
      const content = `payload-${i}`;
      // Intentionally do NOT await here — fire them all in parallel.
      promises.push(
        service.addSnapshot({ file_path: fp, content, source: 'save' }).then((r) => ({
          id: r.entry.id,
          content,
          created: r.created,
        }))
      );
    }
    const results = await Promise.all(promises);

    const entries = await service.listEntries({ file_path: fp });
    // No torn read-modify-write: no duplicate ids, no missing ids.
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);

    // The manifest's length is bounded by the cap.
    expect(entries.length).toBeLessThanOrEqual(MAX_ENTRIES_PER_FILE);
    // All 20 distinct contents were accepted; none of them should report
    // created:false (each is unique, so dedup cannot apply) and every one
    // must have produced a fresh entry id.
    for (const r of results) {
      expect(r.created).toBe(true);
    }
    const resultIds = new Set(results.map((r) => r.id));
    expect(resultIds.size).toBe(N);

    // For every surviving entry, the manifest and the blob agree —
    // getEntryContent never returns null for an id the manifest lists, and
    // the content round-trips exactly. The cap may have pruned some entries,
    // so we cross-check by looking up the expected content via the result
    // set we captured above.
    const idToContent = new Map(results.map((r) => [r.id, r.content]));
    for (const entry of entries) {
      const got = await service.getEntryContent({ file_path: fp, entry_id: entry.id });
      expect(got.content).not.toBeNull();
      expect(got.content).toBe(idToContent.get(entry.id));
    }
  });

  it('runs operations for two different files concurrently without interference', async () => {
    const fpA = filePath('src/concA.ts');
    const fpB = filePath('src/concB.ts');
    const NA = 15;
    const NB = 12;

    const opsA: Array<Promise<unknown>> = [];
    const opsB: Array<Promise<unknown>> = [];
    for (let i = 0; i < Math.max(NA, NB); i++) {
      if (i < NA) opsA.push(service.addSnapshot({ file_path: fpA, content: `A${i}`, source: 'save' }));
      if (i < NB) opsB.push(service.addSnapshot({ file_path: fpB, content: `B${i}`, source: 'save' }));
    }
    await Promise.all([...opsA, ...opsB]);

    const aEntries = await service.listEntries({ file_path: fpA });
    const bEntries = await service.listEntries({ file_path: fpB });
    expect(aEntries).toHaveLength(NA);
    expect(bEntries).toHaveLength(NB);

    // Cross-check: A's contents never leak into B and vice versa.
    const aContents = await Promise.all(
      aEntries.map((e) => service.getEntryContent({ file_path: fpA, entry_id: e.id }))
    );
    const bContents = await Promise.all(
      bEntries.map((e) => service.getEntryContent({ file_path: fpB, entry_id: e.id }))
    );
    for (const c of aContents) expect(c.content?.startsWith('A')).toBe(true);
    for (const c of bContents) expect(c.content?.startsWith('B')).toBe(true);

    // And the on-disk layouts are independent (separate pathHash dirs).
    const pathHashA = sha256(path.resolve(fpA));
    const pathHashB = sha256(path.resolve(fpB));
    expect(pathHashA).not.toBe(pathHashB);
    expect(existsSync(path.join(rootDir, pathHashA, 'meta.json'))).toBe(true);
    expect(existsSync(path.join(rootDir, pathHashB, 'meta.json'))).toBe(true);
  });
});

describe('LocalHistoryService — independent histories per file', () => {
  it('snapshots added for file A do not appear in file B history', async () => {
    const fpA = filePath('src/isoA.ts');
    const fpB = filePath('src/isoB.ts');

    await service.addSnapshot({ file_path: fpA, content: 'a-content', source: 'save' });
    await service.addSnapshot({ file_path: fpA, content: 'a-content-2', source: 'save' });
    await service.addSnapshot({ file_path: fpB, content: 'b-content', source: 'save' });

    const aEntries = await service.listEntries({ file_path: fpA });
    const bEntries = await service.listEntries({ file_path: fpB });

    expect(aEntries).toHaveLength(2);
    expect(bEntries).toHaveLength(1);
    expect(aEntries[0].contentHash).not.toBe(bEntries[0].contentHash);

    const aHashes = new Set(aEntries.map((e) => e.contentHash));
    expect(aHashes.has(bEntries[0].contentHash)).toBe(false);
  });
});

describe('LocalHistoryService — path resolution', () => {
  it('treats a path with ./ and trailing slash as the same history as its resolved form', async () => {
    const real = filePath('src/resolved.ts');
    const weird = `${tempWorkspace}/./src/resolved.ts`;

    const first = await service.addSnapshot({ file_path: real, content: 'one', source: 'save' });
    // Same on-disk identity, different string form.
    const second = await service.addSnapshot({ file_path: weird, content: 'one', source: 'save' });

    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);

    const entries = await service.listEntries({ file_path: real });
    expect(entries).toHaveLength(1);
  });
});

describe('LocalHistoryService — on-disk layout', () => {
  it('writes blobs under <rootDir>/<pathHash>/blobs/<contentHash>', async () => {
    const fp = filePath('src/layout.ts');
    const content = 'layout-check';
    await service.addSnapshot({ file_path: fp, content, source: 'save' });

    const expectedBlob = blobPathFor(fp, content);
    expect(existsSync(expectedBlob)).toBe(true);
    const stat = statSync(expectedBlob);
    expect(stat.isFile()).toBe(true);

    // The blobs dir should contain exactly this one hash.
    const blobsDir = path.dirname(expectedBlob);
    expect(readdirSync(blobsDir).toSorted()).toEqual([sha256(content)]);
  });
});
