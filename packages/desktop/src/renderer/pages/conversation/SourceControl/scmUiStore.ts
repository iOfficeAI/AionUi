/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SCM panel UI-state store — the collapse/height/view-mode state that is a
 * property of *how the panel is shown*, not of the source-control data. It is a
 * module-level store with a `useSyncExternalStore` surface (same shape as
 * `explorerStore`), kept separate from `scmStore` on purpose: `scmStore` mirrors
 * the wire (repos, statuses, seq), this mirrors the user's view preferences.
 *
 * Persistence is per-project to localStorage (`scm-ui:${projectId}`), matching
 * `explorer-ui:${id}` — cross-project state never bleeds, and a corrupt/oversized
 * record degrades to defaults rather than throwing. All reads/writes go through
 * the same try/catch guards.
 *
 * The section model is **generalized**: sections are addressed by a string id
 * (`'repositories'`, `'changes'`, and a future `'graph'`), never by a fixed count.
 * Collapse state and drag height are stored in id-keyed maps, so adding a third
 * section is a matter of rendering it — no store change.
 */

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

/** How the Changes section lists resources. `list` is the flat status order; `tree` groups by directory. */
export type ScmViewMode = 'list' | 'tree';

/** Immutable view handed to React via `useSyncExternalStore`. */
export type ScmUiView = {
  projectId: string | null;
  /** Section id → collapsed. Absent id ⇒ expanded (the default). */
  collapsed: Record<string, boolean>;
  /** Section id → user-dragged body height in px. Absent id ⇒ the section's natural/flex height. */
  heights: Record<string, number>;
  /** Directory keys the tree view has expanded. Absent ⇒ the view expands all by default. */
  treeExpanded: string[];
  /**
   * Primary `repo_id`s whose nested worktree rows are collapsed in the Repositories
   * section. Absent id ⇒ expanded (the default), so only collapsed parents are
   * stored — a fresh project shows every worktree, matching VS Code.
   */
  repoCollapsed: string[];
  viewMode: ScmViewMode;
};

type PersistedUi = {
  collapsed?: Record<string, boolean>;
  heights?: Record<string, number>;
  treeExpanded?: string[];
  repoCollapsed?: string[];
  viewMode?: ScmViewMode;
};

let projectId: string | null = null;
let collapsed: Map<string, boolean> = new Map();
let heights: Map<string, number> = new Map();
let treeExpanded: Set<string> | null = null; // null ⇒ "expand all" default, not yet overridden
let repoCollapsed: Set<string> = new Set(); // only collapsed worktree parents; empty ⇒ all expanded
let viewMode: ScmViewMode = 'list';

let snapshot: ScmUiView = {
  projectId: null,
  collapsed: {},
  heights: {},
  treeExpanded: [],
  repoCollapsed: [],
  viewMode: 'list',
};

// ── persistence (per-project) ────────────────────────────────────────────────

const uiStorageKey = (id: string): string => `scm-ui:${id}`;

const getLocalStorage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const isViewMode = (v: unknown): v is ScmViewMode => v === 'list' || v === 'tree';

/** A plain record of primitive values, ignoring anything malformed. */
const sanitizeRecord = <T>(raw: unknown, keep: (v: unknown) => v is T): Record<string, T> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (keep(v)) out[k] = v;
  }
  return out;
};

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
// A drag height must be a finite positive number; anything else (NaN, 0, negative,
// a string) is dropped so a corrupt record can never wedge a section shut.
const isPositiveNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

const loadUi = (id: string): PersistedUi => {
  const ls = getLocalStorage();
  if (!ls) return {};
  try {
    const raw = ls.getItem(uiStorageKey(id));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedUi>;
    return {
      collapsed: sanitizeRecord(parsed.collapsed, isBoolean),
      heights: sanitizeRecord(parsed.heights, isPositiveNumber),
      treeExpanded: Array.isArray(parsed.treeExpanded)
        ? parsed.treeExpanded.filter((k): k is string => typeof k === 'string')
        : undefined,
      repoCollapsed: Array.isArray(parsed.repoCollapsed)
        ? parsed.repoCollapsed.filter((k): k is string => typeof k === 'string')
        : undefined,
      viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : undefined,
    };
  } catch {
    return {};
  }
};

const persistUi = (): void => {
  const ls = getLocalStorage();
  if (!ls || !projectId) return;
  const data: PersistedUi = {
    collapsed: Object.fromEntries(collapsed),
    heights: Object.fromEntries(heights),
    viewMode,
  };
  // Only persist an explicit tree expansion once the user has touched it; a null
  // set means "still on the expand-all default", which needs no stored override.
  if (treeExpanded) data.treeExpanded = [...treeExpanded];
  // Empty ⇒ every worktree parent expanded (the default); skip the key entirely.
  if (repoCollapsed.size > 0) data.repoCollapsed = [...repoCollapsed];
  try {
    ls.setItem(uiStorageKey(projectId), JSON.stringify(data));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
};

// ── snapshot + notify ──────────────────────────────────────────────────────

const rebuildSnapshot = (): void => {
  snapshot = {
    projectId,
    collapsed: Object.fromEntries(collapsed),
    heights: Object.fromEntries(heights),
    treeExpanded: treeExpanded ? [...treeExpanded] : [],
    repoCollapsed: [...repoCollapsed],
    viewMode,
  };
};

const commit = (): void => {
  rebuildSnapshot();
  for (const listener of listeners) listener();
};

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Open a project's UI state: restore collapse/height/view-mode from localStorage.
 * A no-op when the project is already open (idempotent under container remounts,
 * like `explorerStore.openProject`), so a conversation switch that re-mounts the
 * panel does not reset the user's live view.
 */
export const openScmUi = (id: string): void => {
  if (projectId === id) return;
  projectId = id;
  const ui = loadUi(id);
  collapsed = new Map(Object.entries(ui.collapsed ?? {}));
  heights = new Map(Object.entries(ui.heights ?? {}));
  treeExpanded = ui.treeExpanded ? new Set(ui.treeExpanded) : null;
  repoCollapsed = new Set(ui.repoCollapsed ?? []);
  viewMode = ui.viewMode ?? 'list';
  commit();
};

export const setSectionCollapsed = (sectionId: string, isCollapsed: boolean): void => {
  collapsed.set(sectionId, isCollapsed);
  persistUi();
  commit();
};

export const setSectionHeight = (sectionId: string, px: number): void => {
  if (!Number.isFinite(px) || px <= 0) return;
  heights.set(sectionId, px);
  persistUi();
  commit();
};

/** Clear a stored drag height so the section returns to its natural/flex sizing. */
export const clearSectionHeight = (sectionId: string): void => {
  if (!heights.has(sectionId)) return;
  heights.delete(sectionId);
  persistUi();
  commit();
};

export const setScmViewMode = (mode: ScmViewMode): void => {
  if (viewMode === mode) return;
  viewMode = mode;
  persistUi();
  commit();
};

/** Replace the tree view's expanded directory set (from the recursive tree's expand handler). */
export const setScmTreeExpanded = (keys: string[]): void => {
  treeExpanded = new Set(keys);
  persistUi();
  commit();
};

/** Collapse or expand a primary repo's nested worktree rows in the Repositories section. */
export const setRepoWorktreesCollapsed = (repoId: string, isCollapsed: boolean): void => {
  if (isCollapsed === repoCollapsed.has(repoId)) return;
  if (isCollapsed) repoCollapsed.add(repoId);
  else repoCollapsed.delete(repoId);
  persistUi();
  commit();
};

export const subscribeScmUi = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getScmUiSnapshot = (): ScmUiView => snapshot;

export const useScmUi = (): ScmUiView => useSyncExternalStore(subscribeScmUi, getScmUiSnapshot, getScmUiSnapshot);

/**
 * Test hook: reset in-memory module state (not persisted storage). Callers that
 * also need a clean localStorage — e.g. to simulate a fresh browser rather than a
 * reload — should clear it themselves; a bare reset is what the persistence tests
 * rely on to model a reload that must survive.
 */
export const resetScmUiStoreForTest = (): void => {
  projectId = null;
  collapsed = new Map();
  heights = new Map();
  treeExpanded = null;
  repoCollapsed = new Set();
  viewMode = 'list';
  snapshot = { projectId: null, collapsed: {}, heights: {}, treeExpanded: [], repoCollapsed: [], viewMode: 'list' };
  listeners.clear();
};
