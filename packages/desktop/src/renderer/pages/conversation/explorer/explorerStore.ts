/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Explorer store — module-level state (fact cache + UI state + reported set) with
 * a `useSyncExternalStore` subscribe/getSnapshot surface, following the
 * `conversationRuntimeViewStore` pattern. It wires the pure `explorerModel` to a
 * `MonitorPort` (subscribe/unsubscribe) and applies server pushes with the three
 * anti-stale rules. See `formal/runtime/frontend.md`.
 *
 * The reconcile primitive is the only subscription logic: state changes schedule
 * a microtask-tail reconcile that merges the tick's mutations into one batched
 * subscribe/unsubscribe. UI state persists per-project to localStorage; the fact
 * cache and reported set are memory-only.
 */

import type { Change, DirRef, Entry, FactCache, PeKey, RootRef, TreeNode } from './explorerModel';
import {
  applyDelta,
  applySnapshot,
  buildTreeData,
  deriveWant,
  joinRel,
  keyToRef,
  migrateKey,
  peKey,
  reconcileDiff,
  refToKey,
  subtreeKeys,
} from './explorerModel';

export type SubscribeResult = {
  snapshots: Array<{ target: DirRef; entries: Entry[] }>;
};

/** The subscription transport the store drives (bound to MonitorClient in prod). */
export type MonitorPort = {
  subscribe: (refs: DirRef[]) => Promise<SubscribeResult>;
  unsubscribe: (refs: DirRef[]) => void;
};

/** Immutable view handed to React via `useSyncExternalStore`. */
export type ExplorerView = {
  projectId: string | null;
  treeData: TreeNode[];
  selected: PeKey | null;
  /** Expanded dir keys — drives arco Tree's controlled `expandedKeys` so the
   *  visual expand state stays in sync with the store (which owns subscriptions). */
  expanded: PeKey[];
};

type PersistedUi = {
  expanded: PeKey[];
  selected?: PeKey;
};

const listeners = new Set<() => void>();

let port: MonitorPort | null = null;
let projectId: string | null = null;
let roots: RootRef[] = [];
let cache: FactCache = new Map();
let expanded = new Set<PeKey>();
let selected: PeKey | null = null;
let current = new Set<PeKey>();

let snapshot: ExplorerView = { projectId: null, treeData: [], selected: null, expanded: [] };
let reconcileScheduled = false;

// ── persistence (per-project UI state) ──────────────────────────────────────

const uiStorageKey = (id: string): string => `explorer-ui:${id}`;

const getLocalStorage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const loadUi = (id: string): PersistedUi => {
  const ls = getLocalStorage();
  if (!ls) return { expanded: [] };
  try {
    const raw = ls.getItem(uiStorageKey(id));
    if (!raw) return { expanded: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedUi>;
    return { expanded: Array.isArray(parsed.expanded) ? parsed.expanded : [], selected: parsed.selected };
  } catch {
    return { expanded: [] };
  }
};

/**
 * Persist this project's UI state (expanded set + selection) to localStorage.
 *
 * `guardEmptyOverwrite` scopes the ③ anti-clobber to the ONE unsafe caller —
 * openProject's leave-persist. There, under a project-switch race, the in-memory
 * `expanded` can be transiently empty while `projectId` still points at a project
 * whose saved state is populated; writing that empty set would permanently
 * destroy the stored expansion (observed LS 4 → 0, a collapse the user never
 * asked for), so it keeps the richer stored expansion (selection still updates).
 * Every user-driven caller (setExpanded / setExpandedKeys / reveal / select)
 * omits the flag, so a genuine collapse-all persists empty normally — and because
 * that user path writes the empty first, a later leave-persist reads an already
 * empty record and has nothing to guard, leaving no stale-expansion residue.
 */
const persistUi = (opts?: { guardEmptyOverwrite?: boolean }): void => {
  const ls = getLocalStorage();
  if (!ls || !projectId) return;
  const data: PersistedUi = { expanded: [...expanded] };
  if (selected) data.selected = selected;
  if (opts?.guardEmptyOverwrite && data.expanded.length === 0) {
    try {
      const raw = ls.getItem(uiStorageKey(projectId));
      const prev = raw ? (JSON.parse(raw) as Partial<PersistedUi>) : null;
      if (prev && Array.isArray(prev.expanded) && prev.expanded.length > 0) {
        data.expanded = prev.expanded;
      }
    } catch {
      /* corrupt/absent record — fall through and write what we have */
    }
  }
  try {
    ls.setItem(uiStorageKey(projectId), JSON.stringify(data));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
};

// ── snapshot + notify ────────────────────────────────────────────────────────

const rebuildSnapshot = (): void => {
  snapshot = { projectId, treeData: buildTreeData(cache, expanded, roots), selected, expanded: [...expanded] };
};

const commit = (): void => {
  rebuildSnapshot();
  for (const listener of listeners) listener();
};

// ── reconcile (the only subscription primitive) ─────────────────────────────

const runReconcile = (): void => {
  if (!port) return;
  const want = deriveWant(expanded);
  const { toAdd, toRemove } = reconcileDiff(want, current);
  current = want;
  if (toRemove.length > 0) {
    port.unsubscribe(toRemove.map(keyToRef));
  }
  if (toAdd.length > 0) {
    port
      .subscribe(toAdd.map(keyToRef))
      .then((result) => {
        // Apply each returned snapshot, guarding against keys no longer wanted
        // (the tree may have collapsed while the request was in flight).
        const stillWant = deriveWant(expanded);
        let changed = false;
        for (const snap of result.snapshots) {
          const key = refToKey(snap.target);
          if (!stillWant.has(key)) continue; // guard: dropped
          cache = applySnapshot(cache, key, snap.entries);
          changed = true;
        }
        if (changed) commit();
      })
      .catch(() => {
        // Subscribe failed (offline, or the socket not yet ready right after a
        // reconnect). Roll the just-declared keys back out of `current`: leaving
        // them there would strand them as permanently-but-falsely declared, so
        // reconcileDiff would see them as already-current and never re-add them —
        // the directory would keep its stale cache and receive no more updates,
        // an invisible failure (it looks identically "expanded with contents").
        // Rolled back, they re-enter `toAdd` on the next reconcile — the reconnect
        // re-declare, or any user expand/collapse — which retries the subscribe.
        // We deliberately do NOT reschedule here: retrying immediately against a
        // still-dead socket would hammer it every round-trip; the next reconcile
        // trigger is the retry.
        for (const key of toAdd) current.delete(key);
      });
  }
};

/** Schedule a reconcile at the microtask tail, merging this tick's changes. */
const scheduleReconcile = (): void => {
  if (reconcileScheduled) return;
  reconcileScheduled = true;
  queueMicrotask(() => {
    reconcileScheduled = false;
    runReconcile();
  });
};

// ── server push application (with anti-stale rules) ─────────────────────────

/** Whether an incoming push target is still wanted (guard rule). */
const isWanted = (key: PeKey): boolean => deriveWant(expanded).has(key);

const applyServerSnapshot = (target: DirRef, entries: Entry[]): void => {
  const key = refToKey(target);
  if (!isWanted(key)) return; // guard: unsubscribe-in-flight residue → drop
  cache = applySnapshot(cache, key, entries);
  commit();
};

const applyServerDelta = (target: DirRef, changes: Change[]): void => {
  const key = refToKey(target);
  if (!isWanted(key)) return; // guard
  cache = applyDelta(cache, key, changes);

  // Structural anti-stale rules on expanded/current/cache.
  for (const change of changes) {
    if (change.op === 'removed') {
      // removed cascade: prune the removed child's whole subtree.
      const childKey = peKey(target.pe_id, joinRel(target.relative_path, change.name));
      pruneSubtree(childKey);
    } else if (change.op === 'renamed') {
      // renamed migration: move expanded/current/cache keys from old prefix to new.
      const fromKey = peKey(target.pe_id, joinRel(target.relative_path, change.from));
      const toKey = peKey(target.pe_id, joinRel(target.relative_path, change.to));
      migratePrefix(fromKey, toKey);
    }
  }
  commit();
  scheduleReconcile(); // subtree prune/migrate may have changed want
};

const pruneSubtree = (rootKey: PeKey): void => {
  for (const key of subtreeKeys([...expanded], rootKey)) expanded.delete(key);
  for (const key of subtreeKeys([...current], rootKey)) current.delete(key);
  for (const key of subtreeKeys([...cache.keys()], rootKey)) cache.delete(key);
};

const migratePrefix = (fromKey: PeKey, toKey: PeKey): void => {
  expanded = new Set([...expanded].map((k) => migrateKey(k, fromKey, toKey)));
  current = new Set([...current].map((k) => migrateKey(k, fromKey, toKey)));
  const nextCache: FactCache = new Map();
  for (const [k, v] of cache) nextCache.set(migrateKey(k, fromKey, toKey), v);
  cache = nextCache;
};

// ── public API ───────────────────────────────────────────────────────────────

/** Wire the subscription transport (call once at startup / test setup). */
export const configureExplorerStore = (nextPort: MonitorPort): void => {
  port = nextPort;
};

/** Route a monitor notification (fs/snapshot | fs/delta) into the store. */
export const applyMonitorNotification = (method: string, params: unknown): void => {
  if (method === 'fs/snapshot') {
    const p = params as { target: DirRef; entries: Entry[] };
    applyServerSnapshot(p.target, p.entries);
  } else if (method === 'fs/delta') {
    const p = params as { target: DirRef; changes: Change[] };
    applyServerDelta(p.target, p.changes);
  }
};

/**
 * Identity of a root set for the same-project guard: the **sorted** pe_id set.
 * Order-independent on purpose — any set change (attach / remove / swap a pe)
 * changes the identity → full reset; a pure reorder (same pe set, different
 * order) is intentionally NOT treated as a change here, so it never triggers a
 * reset/flicker and cannot be masked by caller-side order jitter. Reorder is
 * deferred (D5); when added it must reflect the new order through its own update
 * path, not by re-triggering openProject.
 */
const rootsIdentity = (rs: RootRef[]): string =>
  rs
    .map((r) => r.pe_id)
    .toSorted()
    .join('\0');

/**
 * Open a project: load its pe roots + restore UI state, then reconcile.
 *
 * Same-project guard: the Explorer container remounts on every conversation
 * switch (its parent panel is keyed by `conversation.id`), which would otherwise
 * re-run openProject and wipe the live fact cache + re-subscribe (a visible
 * flicker). When the project id AND its root set (by pe_id) are unchanged, we
 * treat this as a remount, not a switch: keep the live cache / subscriptions /
 * expanded / selected intact, and only refresh root display metadata (titles may
 * have changed) — no reset, no reconcile. A real project change, or a root-set
 * change (attach/remove adds/removes a pe), falls through to the full reset.
 */
export const openProject = (id: string, projectRoots: RootRef[]): void => {
  if (projectId === id && rootsIdentity(projectRoots) === rootsIdentity(roots)) {
    roots = projectRoots; // refresh titles/display without disturbing live state
    commit();
    return;
  }
  // Leave-persist for the outgoing project. This is the ONLY empty-write source
  // from a switch race, so it is the only caller that guards against clobbering a
  // populated record with a transiently-empty expanded set (see persistUi).
  if (projectId) persistUi({ guardEmptyOverwrite: true });
  projectId = id;
  roots = projectRoots;
  cache = new Map();
  current = new Set();
  // Restore UI state, but prune any keys whose pe_id is no longer a root of this
  // project (e.g. a folder was removed, or a pe was swapped out). Otherwise stale
  // localStorage entries would re-expand/re-subscribe an orphaned pe that isn't
  // in the tree — a leak. Keys are kept only for the current roots' pe_ids.
  const validPeIds = new Set(projectRoots.map((r) => r.pe_id));
  const ui = loadUi(id);
  const restored = ui.expanded.length > 0 ? ui.expanded : projectRoots.map((r) => peKey(r.pe_id, ''));
  expanded = new Set(restored.filter((k) => validPeIds.has(keyToRef(k).pe_id)));
  selected = ui.selected && validPeIds.has(keyToRef(ui.selected).pe_id) ? ui.selected : null;
  commit();
  scheduleReconcile();
};

/**
 * Replace the whole expanded set from a controlled arco `Tree` (`expandedKeys` +
 * `onExpand` give the full list). The store mirrors arco's visual expand state
 * as the single source; reconcile then derives subscriptions from it. Preferred
 * over per-key toggles for the bound tree — keeps visual and subscription state
 * from drifting.
 */
export const setExpandedKeys = (keys: PeKey[]): void => {
  expanded = new Set(keys);
  persistUi();
  commit();
  scheduleReconcile();
};

/** Expand or collapse a directory. Collapse keeps descendant expanded marks. */
export const setExpanded = (key: PeKey, isExpanded: boolean): void => {
  if (isExpanded) expanded.add(key);
  else expanded.delete(key); // keep descendants' marks (VS Code手感; they fall out of want)
  persistUi();
  commit();
  scheduleReconcile();
};

/** Reveal a deep path: expand the whole ancestor chain in one tick. */
export const reveal = (target: DirRef): void => {
  const segs = target.relative_path === '' ? [] : target.relative_path.split('/');
  expanded.add(peKey(target.pe_id, '')); // root
  let rel = '';
  for (const seg of segs) {
    rel = joinRel(rel, seg);
    expanded.add(peKey(target.pe_id, rel));
  }
  persistUi();
  commit();
  scheduleReconcile();
};

export const select = (key: PeKey | null): void => {
  selected = key;
  persistUi();
  commit();
};

/** Reconnect: drop the reported set and re-declare the full want set. */
export const onReconnect = (): void => {
  current = new Set();
  scheduleReconcile();
};

export const subscribeExplorer = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getExplorerSnapshot = (): ExplorerView => snapshot;

/**
 * Test hook: read the three internal structures (fact cache keys, expanded set,
 * reported set) so end-to-end anti-stale tests can assert all three, not just
 * the cache-derived tree.
 */
export const getExplorerInternalsForTest = (): { cacheKeys: PeKey[]; expanded: PeKey[]; current: PeKey[] } => ({
  cacheKeys: [...cache.keys()],
  expanded: [...expanded],
  current: [...current],
});

/** Test hook: reset all module state. */
export const resetExplorerStoreForTest = (): void => {
  port = null;
  projectId = null;
  roots = [];
  cache = new Map();
  expanded = new Set();
  selected = null;
  current = new Set();
  reconcileScheduled = false;
  snapshot = { projectId: null, treeData: [], selected: null, expanded: [] };
  listeners.clear();
};
