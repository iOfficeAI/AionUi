/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-workspace editor tab persistence.
 *
 * Why a separate module: the editor's open/active buffers are normally
 * derived from user actions (open a file, switch tab, close tab). When the
 * user reopens a conversation we want to restore the exact same set of
 * tabs and the active selection — but {@link EditorContext} is the source
 * of truth for live state, and wiring persistence into its reducer would
 * make it responsible for I/O. This module owns that I/O boundary: read
 * once on hydration, write on debounced changes.
 *
 * Untitled buffers (no `filePath`) ARE persisted when they have a
 * `backupId` — the content lives in the main-process untitled-backup
 * store (see `UntitledBackupService`) and the entry here just carries
 * the `backupId` plus the `untitledMeta` needed to rebuild the tab
 * header on the next launch. Untitled buffers without a `backupId`
 * (e.g. a brand-new buffer that was never edited) are still dropped.
 */

const STORAGE_KEY_PREFIX = 'chisl.editor.tabs.';

const storageKey = (workspaceId: string): string => `${STORAGE_KEY_PREFIX}${workspaceId}`;

/**
 * Resolve the platform's `localStorage`-like object, if any. The renderer
 * uses `window.localStorage`; non-renderer callers (e.g. Node tests) get
 * `globalThis.localStorage` (typically a polyfill installed by the test
 * setup). Returns null when no storage is available.
 */
const getStorage = (): Storage | null => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined'
  ) {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  }
  return null;
};

/** Minimal projection of an open buffer that we persist. */
export type PersistedEditorTabEntry = {
  /** Present for saved files. Absolute path on disk. */
  path?: string;
  /** Workspace root the path was opened from, if any. */
  workspace?: string;
  /** Present for untitled (hot-exit) files. Identifies the main-process backup. */
  backupId?: string;
  /** Required when `backupId` is set. Restores the tab header on rehydration. */
  untitledMeta?: { fileName: string; language: string };
};

/** A persisted split group (Epic C). Serialized by file path, not buffer key. */
export type PersistedEditorGroup = {
  /** Ordered file paths shown in this group. */
  entryPaths: string[];
  /** Active file path within the group, if any. */
  activePath: string | null;
};

/** What we write per workspace. */
export type PersistedEditorTabs = {
  entries: PersistedEditorTabEntry[];
  activePath?: string;
  /**
   * Optional split layout. Absent for legacy data (read as a single group).
   * `entries` always remains the de-duplicated union of all group paths so
   * older app versions can still restore tabs without group structure.
   */
  groups?: PersistedEditorGroup[];
};

/**
 * Public flag type — consumers (e.g. hydration guards) can import it for
 * typing without depending on the internal hydration implementation.
 */
export type EditorTabsHydrationFlag = {
  hydrated: boolean;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const normalizeEntry = (raw: unknown): PersistedEditorTabEntry | null => {
  if (!isPlainObject(raw)) return null;
  const entry: PersistedEditorTabEntry = {};
  if (isString(raw.path)) entry.path = raw.path;
  if (isString(raw.workspace)) entry.workspace = raw.workspace;
  if (isString(raw.backupId)) entry.backupId = raw.backupId;
  if (isPlainObject(raw.untitledMeta)) {
    const meta = raw.untitledMeta as Record<string, unknown>;
    if (isString(meta.fileName) && isString(meta.language)) {
      entry.untitledMeta = { fileName: meta.fileName, language: meta.language };
    }
  }
  // A valid entry must identify EITHER a saved file OR an untitled backup,
  // and an untitled entry must carry its meta to be rehydratable.
  if (!entry.path && !entry.backupId) return null;
  if (entry.backupId && !entry.untitledMeta) return null;
  return entry;
};

/**
 * Read the persisted tab set for a workspace. Returns `null` when nothing
 * has ever been stored, the stored value is corrupt, or storage is
 * unavailable (SSR / non-browser callers).
 */
export const readEditorTabs = (workspaceId: string): PersistedEditorTabs | null => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const entriesRaw = parsed.entries;
    if (!Array.isArray(entriesRaw)) return null;
    const entries: PersistedEditorTabEntry[] = [];
    const seen = new Set<string>();
    for (const e of entriesRaw) {
      const norm = normalizeEntry(e);
      if (!norm) continue;
      // Dedup key spans (workspace, path) for saved files and `backup:<id>`
      // for untitled buffers. The two namespaces can't collide (one uses
      // `path`, the other `backupId`) so they're combined in a single Set.
      const dedupKey = norm.path ? `${norm.workspace ?? ''}::${norm.path}` : `backup:${norm.backupId ?? ''}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      entries.push(norm);
    }
    const result: PersistedEditorTabs = { entries };
    if (isString(parsed.activePath)) result.activePath = parsed.activePath;
    // Optional split layout. Unknown / corrupt → treated as absent (single group).
    if (Array.isArray(parsed.groups)) {
      const validPaths = new Set(entries.map((e) => e.path));
      const groups: PersistedEditorGroup[] = [];
      for (const g of parsed.groups) {
        if (!isPlainObject(g) || !Array.isArray(g.entryPaths)) continue;
        const entryPaths = g.entryPaths.filter((p): p is string => isString(p) && validPaths.has(p));
        if (entryPaths.length === 0) continue;
        const activePath = isString(g.activePath) && entryPaths.includes(g.activePath) ? g.activePath : null;
        groups.push({ entryPaths, activePath });
      }
      if (groups.length > 0) result.groups = groups;
    }
    return result;
  } catch {
    return null;
  }
};

/**
 * Persist the tab set for a workspace. Entries that identify neither a
 * path nor a `backupId` are defensively dropped. The split `groups`
 * layout and `activePath` are still path-only — untitled buffers are
 * restored into the focused group and don't carry their own group
 * position in V1.
 */
export const writeEditorTabs = (workspaceId: string, value: PersistedEditorTabs): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  // Filter to entries we can rehydrate: saved files by `path`, untitled
  // hot-exit buffers by `backupId` (with their meta).
  const entries = value.entries
    .filter(
      (e): e is PersistedEditorTabEntry =>
        isString(e?.path) || (isString(e?.backupId) && isPlainObject(e?.untitledMeta))
    )
    .map((e) => {
      const entry: PersistedEditorTabEntry = {};
      if (isString(e.path)) entry.path = e.path;
      if (isString(e.workspace)) entry.workspace = e.workspace;
      if (isString(e.backupId)) entry.backupId = e.backupId;
      if (e.untitledMeta) {
        entry.untitledMeta = {
          fileName: e.untitledMeta.fileName,
          language: e.untitledMeta.language,
        };
      }
      return entry;
    });
  // Dedupe so re-hydration can't double-open a file or restore the same
  // untitled backup twice. Saved files and untitled backups live in
  // disjoint namespaces (`path` vs `backup:<id>`).
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    const k = e.path ? `${e.workspace ?? ''}::${e.path}` : `backup:${e.backupId ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const payload: PersistedEditorTabs = { entries: deduped };
  if (isString(value.activePath)) payload.activePath = value.activePath;
  // Persist split layout when present. Drop paths that aren't in the deduped
  // entry set and empty groups, so hydration can't reference a missing file.
  if (Array.isArray(value.groups) && value.groups.length > 0) {
    const validPaths = new Set(deduped.flatMap((e) => (e.path ? [e.path] : [])));
    const groups = value.groups
      .map((g) => {
        const entryPaths = g.entryPaths.filter((p) => isString(p) && validPaths.has(p));
        const activePath = isString(g.activePath) && entryPaths.includes(g.activePath) ? g.activePath : null;
        return { entryPaths, activePath };
      })
      .filter((g) => g.entryPaths.length > 0);
    // Only persist groups when there's an actual split (>1 group); a single
    // group is the legacy default and adds no information.
    if (groups.length > 1) payload.groups = groups;
  }
  try {
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(payload));
  } catch {
    /* localStorage unavailable — caller can retry */
  }
};

/**
 * Clear the persisted tab set for a workspace. Used by "Close All" or on
 * errors during hydration.
 */
export const clearEditorTabs = (workspaceId: string): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(workspaceId));
  } catch {
    /* ignore */
  }
};
