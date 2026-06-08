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
 * Untitled buffers (no `filePath`) are never persisted — there's nothing
 * meaningful to restore for a file that never reached disk.
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
  /** Absolute path on disk. */
  path: string;
  /** Workspace root the path was opened from, if any. */
  workspace?: string;
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
  if (!isString(raw.path)) return null;
  const entry: PersistedEditorTabEntry = { path: raw.path };
  if (isString(raw.workspace)) entry.workspace = raw.workspace;
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
      const dedupKey = `${norm.workspace ?? ''}::${norm.path}`;
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
 * Persist the tab set for a workspace. Untitled buffers must be filtered
 * out by the caller; we defensively drop entries that lack a `path` field
 * as well, but we never derive `path` from any other field.
 */
export const writeEditorTabs = (workspaceId: string, value: PersistedEditorTabs): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  // Filter to file-backed entries only — never persist untitled buffers.
  const entries = value.entries
    .filter((e): e is PersistedEditorTabEntry => isString(e?.path))
    .map((e) => {
      const entry: PersistedEditorTabEntry = { path: e.path };
      if (isString(e.workspace)) entry.workspace = e.workspace;
      return entry;
    });
  // Dedupe by (workspace,path) so re-hydration can't double-open a file.
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    const k = `${e.workspace ?? ''}::${e.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const payload: PersistedEditorTabs = { entries: deduped };
  if (isString(value.activePath)) payload.activePath = value.activePath;
  // Persist split layout when present. Drop paths that aren't in the deduped
  // entry set and empty groups, so hydration can't reference a missing file.
  if (Array.isArray(value.groups) && value.groups.length > 0) {
    const validPaths = new Set(deduped.map((e) => e.path));
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
