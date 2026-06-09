/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main-process Untitled Backup service — VS Code-style transparent
 * hot-exit backups for untitled (unsaved) files.
 *
 * Every open untitled editor in the renderer is paired with a stable
 * `backupId`; on each write the renderer pushes the current content
 * and a small meta record here. On next launch the renderer calls
 * `list()` to discover backups that have no on-disk file, then
 * `read(...)` to rehydrate the editor.
 *
 * On-disk layout (under `userData/untitled-backups/`):
 *
 *   <root>/
 *     <backupId>.content       raw UTF-8 string
 *     <backupId>.meta.json     JSON ({ backupId, fileName, language, timestamp })
 *
 * The two-file split mirrors VS Code's hot-exit store: the meta file
 * is what `list()` scans (so a corrupt content file is harmless — the
 * backup is still discoverable for cleanup). Orphan `.content` files
 * (no matching meta) are ignored by `list()` and best-effort cleaned
 * up on the next `write` for the same id.
 *
 * Concurrency: writes are serialized through a per-`backupId` promise
 * chain (`runExclusive`) so two rapid writes for the same id can never
 * interleave a temp-file rename of the content with the meta. Writes
 * for DIFFERENT ids run concurrently.
 *
 * The service performs local IO only and is fully decoupled from
 * aioncore.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getPlatformServices } from '@/common/platform';
import type {
  UntitledBackupDeleteRequest,
  UntitledBackupMeta,
  UntitledBackupReadRequest,
  UntitledBackupReadResult,
  UntitledBackupWriteRequest,
} from '@/common/types/untitledBackup/untitledBackupTypes';

const META_SUFFIX = '.meta.json';
const CONTENT_SUFFIX = '.content';

/** Constructor dependencies (test injection). */
export type UntitledBackupServiceDeps = {
  /** Override the root directory (test injection). Defaults to
   * `userData/untitled-backups`. */
  rootDir?: string;
};

export class UntitledBackupService {
  private readonly rootDir: string;

  /** Per-`backupId` serialization chains. Each stored promise is a
   * never-rejecting tail so the next caller can safely await it. */
  private readonly locks = new Map<string, Promise<void>>();

  constructor(deps: UntitledBackupServiceDeps = {}) {
    this.rootDir = deps.rootDir ?? path.join(getPlatformServices().paths.getDataDir(), 'untitled-backups');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Persist (or overwrite) a backup for `backupId`. Writes both the
   * content file and the meta file atomically (temp file + renameSync,
   * with a best-effort copy/unlink fallback for Windows where rename
   * over an existing target can fail).
   */
  async write(req: UntitledBackupWriteRequest): Promise<UntitledBackupMeta> {
    const { backupId, content, meta } = req;
    return this.runExclusive(backupId, () => {
      this.ensureRoot();

      const metaRecord: UntitledBackupMeta = {
        ...meta,
        timestamp: Date.now(),
      };

      const contentPath = this.contentPath(backupId);
      const metaPath = this.metaPath(backupId);

      this.atomicWriteFile(contentPath, content);
      this.atomicWriteFile(metaPath, JSON.stringify(metaRecord));

      return metaRecord;
    });
  }

  /** Fetch the persisted content + meta for a single backup, or null
   * when no meta file exists for `backupId`. */
  async read(req: UntitledBackupReadRequest): Promise<UntitledBackupReadResult | null> {
    return this.runExclusive(req.backupId, () => {
      this.ensureRoot();
      const contentPath = this.contentPath(req.backupId);
      const metaPath = this.metaPath(req.backupId);

      if (!existsSync(metaPath)) return null;

      const meta = this.readMetaFile(metaPath);
      // Defensive: if the meta exists but the content doesn't (e.g. a
      // prior crash between the two writes), treat the backup as gone.
      if (!existsSync(contentPath)) return null;

      const content = readFileSync(contentPath, 'utf8');
      return { content, meta };
    });
  }

  /** Remove a single backup (both content and meta files). */
  async delete(req: UntitledBackupDeleteRequest): Promise<void> {
    await this.runExclusive(req.backupId, () => {
      this.ensureRoot();
      const contentPath = this.contentPath(req.backupId);
      const metaPath = this.metaPath(req.backupId);

      try {
        rmSync(contentPath, { force: true });
      } catch {
        /* ignore — orphan content is harmless, list() will skip it */
      }
      try {
        rmSync(metaPath, { force: true });
      } catch {
        /* ignore */
      }
    });
  }

  /**
   * Enumerate all backups on disk, newest-first by `timestamp`. Scans
   * only `<backupId>.meta.json` files; orphan `.content` files (no
   * matching meta) are ignored. Returns an empty array when the root
   * does not exist yet.
   */
  async list(): Promise<UntitledBackupMeta[]> {
    this.ensureRoot();

    let entries: string[];
    try {
      entries = readdirSync(this.rootDir);
    } catch {
      return [];
    }

    const out: UntitledBackupMeta[] = [];
    for (const name of entries) {
      if (!name.endsWith(META_SUFFIX)) continue;
      const metaPath = path.join(this.rootDir, name);
      const meta = this.readMetaFile(metaPath);
      if (meta) out.push(meta);
    }

    // Newest-first, like VS Code's hot-exit dialog.
    out.sort((a, b) => b.timestamp - a.timestamp);
    return out;
  }

  // -------------------------------------------------------------------------
  // Internals — path resolution
  // -------------------------------------------------------------------------

  private contentPath(backupId: string): string {
    return path.join(this.rootDir, `${backupId}${CONTENT_SUFFIX}`);
  }

  private metaPath(backupId: string): string {
    return path.join(this.rootDir, `${backupId}${META_SUFFIX}`);
  }

  // -------------------------------------------------------------------------
  // Internals — IO
  // -------------------------------------------------------------------------

  private ensureRoot(): void {
    if (!existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
  }

  private atomicWriteFile(target: string, payload: string): void {
    const tmp = `${target}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(tmp, payload, 'utf8');
    try {
      renameSync(tmp, target);
    } catch {
      // Windows can reject rename when the target exists. Fall back to
      // a best-effort overwrite, then clean up the tmp file.
      try {
        writeFileSync(target, readFileSync(tmp, 'utf8'), 'utf8');
      } finally {
        try {
          rmSync(tmp, { force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }

  private readMetaFile(metaPath: string): UntitledBackupMeta | null {
    try {
      const raw = readFileSync(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;
      const obj = parsed as Record<string, unknown>;
      if (
        typeof obj.backupId !== 'string' ||
        typeof obj.fileName !== 'string' ||
        typeof obj.language !== 'string' ||
        typeof obj.timestamp !== 'number'
      ) {
        return null;
      }
      return {
        backupId: obj.backupId,
        fileName: obj.fileName,
        language: obj.language,
        timestamp: obj.timestamp,
      };
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Internals — serialization
  // -------------------------------------------------------------------------

  /**
   * Serialize an operation against a single `backupId`. Operations for
   * the same id run one-at-a-time (preventing temp-file/rename races);
   * operations for different ids run concurrently.
   */
  private runExclusive<T>(backupId: string, op: () => T): Promise<T> {
    const key = backupId;
    const prev: Promise<void> = this.locks.get(key) ?? Promise.resolve();
    // Chain after the previous op SETTLES (success or failure) so one
    // failed operation never wedges the chain for that id.
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

/** Process-wide singleton used by the bridge layer. */
let singleton: UntitledBackupService | null = null;

export function getUntitledBackupService(): UntitledBackupService {
  if (!singleton) {
    singleton = new UntitledBackupService();
  }
  return singleton;
}

export function resetUntitledBackupServiceForTests(): void {
  singleton = null;
}
