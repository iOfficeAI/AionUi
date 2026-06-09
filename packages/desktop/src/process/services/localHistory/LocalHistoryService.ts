/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main-process Local History service — a VS Code-style "Timeline" backend
 * that works WITHOUT git.
 *
 * Every save / agent-write / auto-save / restore asks the renderer to push
 * the file's PRIOR content here (see the module JSDoc in
 * `localHistoryTypes.ts` for the before-not-after rationale). Each snapshot
 * is stored content-addressed so identical content is written to disk once
 * and shared across entries.
 *
 * On-disk layout (under `userData/local-history/`):
 *
 *   <root>/
 *     <pathHash>/                 sha256(absolute file path)
 *       meta.json                 { filePath, entries: LocalHistoryEntry[] }
 *       blobs/
 *         <contentHash>           raw UTF-8 content (sha256 of content)
 *
 * Per-file the newest {@link MAX_ENTRIES_PER_FILE} entries are kept; older
 * entries are pruned and their blobs garbage-collected when no surviving
 * entry references them (content-addressed refcount).
 *
 * Concurrency: all operations for a given file path are serialized through a
 * per-path promise chain (`runExclusive`) so two rapid saves — or a save
 * racing an agent write — can never interleave a read-modify-write of the
 * same `meta.json`. Operations across DIFFERENT files run concurrently.
 *
 * The service performs local IO only and is fully decoupled from aioncore.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type {
  LocalHistoryAddRequest,
  LocalHistoryAddResult,
  LocalHistoryClearRequest,
  LocalHistoryContentRequest,
  LocalHistoryContentResult,
  LocalHistoryDeleteRequest,
  LocalHistoryEntry,
  LocalHistoryListRequest,
} from '@/common/types/localHistory/localHistoryTypes';
import { getPlatformServices } from '@/common/platform';

/** Keep at most this many entries per file. Mirrors VS Code's default. */
export const MAX_ENTRIES_PER_FILE = 50;

/** Rapid consecutive saves from the same source within this window (ms)
 * will replace the previous entry rather than creating a new one. */
export const MERGE_WINDOW_MS = 10000;

/** Skip snapshots larger than this (bytes). Local History is for source
 * files, not large binaries / generated bundles. */
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

const META_FILENAME = 'meta.json';
const BLOBS_DIRNAME = 'blobs';

/** Shape persisted to `meta.json`. */
type FileHistoryMeta = {
  filePath: string;
  entries: LocalHistoryEntry[];
};

/** Constructor dependencies (test injection). */
export type LocalHistoryServiceDeps = {
  /** Override the root directory (test injection). Defaults to
   * `userData/local-history`. */
  rootDir?: string;
};

const sha256 = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');

const genEntryId = (timestamp: number): string => `${timestamp}-${randomBytes(4).toString('hex')}`;

export class LocalHistoryService {
  private readonly rootDir: string;

  /** Per-path serialization chains (keyed by pathHash). Each stored promise
   * is a never-rejecting tail so the next caller can safely await it. */
  private readonly locks = new Map<string, Promise<void>>();

  constructor(deps: LocalHistoryServiceDeps = {}) {
    this.rootDir = deps.rootDir ?? path.join(getPlatformServices().paths.getDataDir(), 'local-history');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Snapshot `content` for `file_path`. De-duplicates against the newest
   * existing entry (identical content → no new entry). Enforces the
   * per-file cap and GCs orphaned blobs. Oversized content is rejected
   * (returns the newest entry with `created:false`, or a synthetic empty
   * result when there is none).
   */
  async addSnapshot(req: LocalHistoryAddRequest): Promise<LocalHistoryAddResult> {
    const { file_path, content, source } = req;
    return this.runExclusive(file_path, () => {
      const meta = this.readMeta(file_path);
      const size = Buffer.byteLength(content, 'utf8');

      // Reject oversized snapshots — don't fill userData with bundles.
      if (size > MAX_SNAPSHOT_BYTES) {
        const newest = meta.entries[0];
        return {
          entry: newest ?? this.syntheticEntry(content, source, size),
          created: false,
        };
      }

      const contentHash = sha256(content);

      // De-dupe: identical to the newest entry → no-op (return it).
      const newest = meta.entries[0];
      if (newest && newest.contentHash === contentHash) {
        return { entry: newest, created: false };
      }

      const timestamp = Date.now();
      
      // Merge window: if the newest entry has the same source and was created
      // within MERGE_WINDOW_MS, replace it instead of appending.
      if (newest && newest.source === source && timestamp - newest.timestamp < MERGE_WINDOW_MS) {
        this.writeBlob(file_path, contentHash, content);
        
        // Save the old hash before we overwrite it, so we can GC it if it becomes orphaned
        const oldHash = newest.contentHash;
        
        newest.contentHash = contentHash;
        newest.timestamp = timestamp;
        newest.size = size;
        
        this.gcBlobIfUnreferenced(file_path, oldHash, meta);
        this.writeMeta(file_path, meta);
        
        return { entry: newest, created: true };
      }

      const entry: LocalHistoryEntry = {
        id: genEntryId(timestamp),
        timestamp,
        contentHash,
        size,
        source,
      };

      // Write the blob first (content-addressed → idempotent), then the
      // manifest. If the blob already exists (shared content) this is a
      // cheap existsSync.
      this.writeBlob(file_path, contentHash, content);

      // Newest-first ordering.
      meta.entries.unshift(entry);
      this.pruneAndGc(file_path, meta);
      this.writeMeta(file_path, meta);

      return { entry, created: true };
    });
  }

  /** List all snapshots for a file, newest-first. */
  async listEntries(req: LocalHistoryListRequest): Promise<LocalHistoryEntry[]> {
    return this.runExclusive(req.file_path, () => {
      const meta = this.readMeta(req.file_path);
      return meta.entries;
    });
  }

  /** Fetch the content of a single snapshot, or null when missing. */
  async getEntryContent(req: LocalHistoryContentRequest): Promise<LocalHistoryContentResult> {
    return this.runExclusive(req.file_path, () => {
      const meta = this.readMeta(req.file_path);
      const entry = meta.entries.find((e) => e.id === req.entry_id);
      if (!entry) return { content: null };
      const content = this.readBlob(req.file_path, entry.contentHash);
      return { content };
    });
  }

  /** Delete a single snapshot. GCs its blob when unreferenced. */
  async deleteEntry(req: LocalHistoryDeleteRequest): Promise<LocalHistoryEntry[]> {
    return this.runExclusive(req.file_path, () => {
      const meta = this.readMeta(req.file_path);
      const idx = meta.entries.findIndex((e) => e.id === req.entry_id);
      if (idx === -1) return meta.entries;
      const [removed] = meta.entries.splice(idx, 1);
      this.gcBlobIfUnreferenced(req.file_path, removed.contentHash, meta);
      this.writeMeta(req.file_path, meta);
      return meta.entries;
    });
  }

  /** Delete the entire history for a file (removes its directory). */
  async clear(req: LocalHistoryClearRequest): Promise<void> {
    await this.runExclusive(req.file_path, () => {
      const dir = this.fileDir(req.file_path);
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  // -------------------------------------------------------------------------
  // Internals — path resolution
  // -------------------------------------------------------------------------

  private fileDir(filePath: string): string {
    return path.join(this.rootDir, sha256(path.resolve(filePath)));
  }

  private metaPath(filePath: string): string {
    return path.join(this.fileDir(filePath), META_FILENAME);
  }

  private blobPath(filePath: string, contentHash: string): string {
    return path.join(this.fileDir(filePath), BLOBS_DIRNAME, contentHash);
  }

  // -------------------------------------------------------------------------
  // Internals — manifest IO
  // -------------------------------------------------------------------------

  private readMeta(filePath: string): FileHistoryMeta {
    const metaPath = this.metaPath(filePath);
    try {
      if (!existsSync(metaPath)) return { filePath: path.resolve(filePath), entries: [] };
      const raw = readFileSync(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return { filePath: path.resolve(filePath), entries: [] };
      const obj = parsed as { filePath?: unknown; entries?: unknown };
      const entries = Array.isArray(obj.entries) ? (obj.entries as LocalHistoryEntry[]).filter(isValidEntry) : [];
      // Defensive: ensure newest-first even if the file was hand-edited.
      entries.sort((a, b) => b.timestamp - a.timestamp);
      return { filePath: path.resolve(filePath), entries };
    } catch {
      return { filePath: path.resolve(filePath), entries: [] };
    }
  }

  private writeMeta(filePath: string, meta: FileHistoryMeta): void {
    const metaPath = this.metaPath(filePath);
    this.ensureDir(path.dirname(metaPath));
    // Atomic write: write a tmp file, then `renameSync` over the manifest.
    // `rename` is atomic on POSIX (the reader sees either the old or the new
    // file, never a torn one). A partial blob is harmless — it's
    // content-addressed and simply re-created on the next identical snapshot.
    const tmp = `${metaPath}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(tmp, JSON.stringify(meta), 'utf8');
    try {
      renameSync(tmp, metaPath);
    } catch {
      // Windows can reject rename when the target exists; fall back to a
      // best-effort overwrite, then clean up the tmp file.
      try {
        writeFileSync(metaPath, readFileSync(tmp, 'utf8'), 'utf8');
      } finally {
        try {
          rmSync(tmp, { force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internals — blob IO
  // -------------------------------------------------------------------------

  private writeBlob(filePath: string, contentHash: string, content: string): void {
    const blobPath = this.blobPath(filePath, contentHash);
    if (existsSync(blobPath)) return; // content-addressed → already stored
    this.ensureDir(path.dirname(blobPath));
    writeFileSync(blobPath, content, 'utf8');
  }

  private readBlob(filePath: string, contentHash: string): string | null {
    const blobPath = this.blobPath(filePath, contentHash);
    try {
      if (!existsSync(blobPath)) return null;
      return readFileSync(blobPath, 'utf8');
    } catch {
      return null;
    }
  }

  /** Remove the blob for `contentHash` only when no entry in `meta` still
   * references it (content-addressed refcount). */
  private gcBlobIfUnreferenced(filePath: string, contentHash: string, meta: FileHistoryMeta): void {
    const stillReferenced = meta.entries.some((e) => e.contentHash === contentHash);
    if (stillReferenced) return;
    try {
      rmSync(this.blobPath(filePath, contentHash), { force: true });
    } catch {
      /* ignore — orphan blob is harmless, will be size-bounded by cap */
    }
  }

  /** Enforce the per-file cap, pruning oldest entries and GCing the blobs
   * they leave unreferenced. Mutates `meta.entries` in place. */
  private pruneAndGc(filePath: string, meta: FileHistoryMeta): void {
    if (meta.entries.length <= MAX_ENTRIES_PER_FILE) return;
    const pruned = meta.entries.splice(MAX_ENTRIES_PER_FILE);
    for (const entry of pruned) {
      this.gcBlobIfUnreferenced(filePath, entry.contentHash, meta);
    }
  }

  // -------------------------------------------------------------------------
  // Internals — misc
  // -------------------------------------------------------------------------

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private syntheticEntry(content: string, source: LocalHistoryEntry['source'], size: number): LocalHistoryEntry {
    const timestamp = Date.now();
    return { id: genEntryId(timestamp), timestamp, contentHash: sha256(content), size, source };
  }

  /**
   * Serialize an operation against a single file path. Operations for the
   * same path run one-at-a-time (preventing read-modify-write races on
   * `meta.json`); operations for different paths run concurrently.
   */
  private runExclusive<T>(filePath: string, op: () => T): Promise<T> {
    const key = sha256(path.resolve(filePath));
    const prev: Promise<void> = this.locks.get(key) ?? Promise.resolve();
    // Chain after the previous op SETTLES (success or failure) so one failed
    // operation never wedges the chain for that file. `op` is synchronous in
    // practice, but `await` tolerates a thenable too.
    const run = async (): Promise<T> => {
      try {
        await prev;
      } catch {
        /* previous op failed — proceed regardless so the chain never wedges */
      }
      return op();
    };
    const next = run();
    // Store a never-rejecting tail so the next caller can safely chain on it.
    const tail: Promise<void> = (async (): Promise<void> => {
      try {
        await next;
      } catch {
        /* swallow — failures surface to the original caller via `next` */
      } finally {
        // Clean up the lock if no subsequent operations have been queued.
        if (this.locks.get(key) === tail) {
          this.locks.delete(key);
        }
      }
    })();
    this.locks.set(key, tail);
    return next;
  }
}

const isValidEntry = (value: unknown): value is LocalHistoryEntry => {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.timestamp === 'number' &&
    typeof e.contentHash === 'string' &&
    typeof e.size === 'number' &&
    typeof e.source === 'string'
  );
};

/** Process-wide singleton used by the bridge layer. */
let singleton: LocalHistoryService | null = null;

export function getLocalHistoryService(): LocalHistoryService {
  if (!singleton) {
    singleton = new LocalHistoryService();
  }
  return singleton;
}

export function resetLocalHistoryServiceForTests(): void {
  singleton = null;
}
