/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure model for the Project Explorer front-end runtime (see
 * `formal/runtime/frontend.md`). No I/O, no WS, no React — just the identity
 * key, the want/current reconcile primitive, the fact-cache mutations, the
 * three anti-stale rules, and the tree projection. Everything here is a pure
 * function so it can be unit-tested in isolation; the store wires it to the
 * MonitorClient and `useSyncExternalStore`.
 *
 * Cross-platform: `relative_path` and `PeKey` always use `/` separators (the
 * protocol convention), never a platform separator.
 */

/** One directory entry as delivered by the monitor protocol (`protocol.md`). */
export type EntryKind = 'file' | 'dir' | 'symlink';

export type Entry = {
  name: string;
  kind: EntryKind;
  symlink_target?: string;
  excluded?: boolean;
};

/** Directory / file identity on the wire: pe-relative, never canonical. */
export type DirRef = {
  pe_id: string;
  relative_path: string;
};

/**
 * Unified key for a directory/entry across every front-end structure.
 * `pe_id` + NUL + `relative_path` (root = empty relative_path). The NUL
 * separator can never collide with a path segment.
 */
export type PeKey = string;

const SEP = '\0';

/** Build the PeKey for a `{ pe_id, relative_path }` identity. */
export function peKey(peId: string, relativePath: string): PeKey {
  return `${peId}${SEP}${relativePath}`;
}

/** Build the PeKey from a DirRef. */
export function refToKey(ref: DirRef): PeKey {
  return peKey(ref.pe_id, ref.relative_path);
}

/** Parse a PeKey back to its `{ pe_id, relative_path }` identity. */
export function keyToRef(key: PeKey): DirRef {
  const idx = key.indexOf(SEP);
  if (idx < 0) {
    // Defensive: a key with no separator is a bare pe root.
    return { pe_id: key, relative_path: '' };
  }
  return { pe_id: key.slice(0, idx), relative_path: key.slice(idx + 1) };
}

/**
 * Join a parent relative path with a child name using the protocol separator.
 * Root parent (`''`) yields just the child name.
 */
export function joinRel(parentRel: string, name: string): string {
  return parentRel === '' ? name : `${parentRel}/${name}`;
}

/**
 * Ancestor relative paths of `relativePath`, from immediate parent down to root
 * (`''`). A root (`''`) has no ancestors. Uses `/` segments only.
 */
export function ancestorRels(relativePath: string): string[] {
  if (relativePath === '') return [];
  const segs = relativePath.split('/');
  const out: string[] = [];
  // Drop the last segment repeatedly: "a/b/c" -> "a/b" -> "a" -> "".
  for (let i = segs.length - 1; i >= 1; i--) {
    out.push(segs.slice(0, i).join('/'));
  }
  out.push('');
  return out;
}

/**
 * Derive the "want" set: a directory is wanted (visible, so worth subscribing)
 * iff it is expanded AND every ancestor on its relative path is also expanded —
 * only then is it actually on screen. Root has no ancestors, so
 * `root ∈ want ⟺ root ∈ expanded` (same rule, no special case).
 */
export function deriveWant(expanded: ReadonlySet<PeKey>): Set<PeKey> {
  const want = new Set<PeKey>();
  for (const key of expanded) {
    const { pe_id, relative_path } = keyToRef(key);
    const visible = ancestorRels(relative_path).every((rel) => expanded.has(peKey(pe_id, rel)));
    if (visible) want.add(key);
  }
  return want;
}

/** The reconcile diff: what to subscribe (want − current) and unsubscribe (current − want). */
export type ReconcileDiff = {
  toAdd: PeKey[];
  toRemove: PeKey[];
};

/**
 * Compute the subscribe/unsubscribe diff between the desired `want` and the
 * already-reported `current`. Sets make this dedup-free and idempotent.
 */
export function reconcileDiff(want: ReadonlySet<PeKey>, current: ReadonlySet<PeKey>): ReconcileDiff {
  const toAdd: PeKey[] = [];
  const toRemove: PeKey[] = [];
  for (const key of want) if (!current.has(key)) toAdd.push(key);
  for (const key of current) if (!want.has(key)) toRemove.push(key);
  return { toAdd, toRemove };
}

// ── fact cache (server truth mirror) ────────────────────────────────────────

/** Sparse mirror of the backend tree: only subscribed dirs → their one level. */
export type FactCache = Map<PeKey, Entry[]>;

/** `fs/snapshot`: replace the whole listing for a directory. Returns a new cache. */
export function applySnapshot(cache: FactCache, key: PeKey, entries: Entry[]): FactCache {
  const next = new Map(cache);
  next.set(key, entries);
  return next;
}

export type Change =
  | { op: 'added'; name: string; kind: EntryKind; excluded?: boolean }
  | { op: 'removed'; name: string }
  | { op: 'renamed'; from: string; to: string };

/**
 * `fs/delta`: apply incremental changes to one directory's listing. Unknown
 * directory (not cached) is left untouched. Returns a new cache.
 */
export function applyDelta(cache: FactCache, key: PeKey, changes: Change[]): FactCache {
  const existing = cache.get(key);
  if (!existing) return cache;
  let entries = existing.slice();
  for (const change of changes) {
    switch (change.op) {
      case 'added': {
        const entry: Entry = { name: change.name, kind: change.kind };
        if (change.excluded) entry.excluded = true;
        entries = entries.filter((e) => e.name !== change.name);
        entries.push(entry);
        break;
      }
      case 'removed':
        entries = entries.filter((e) => e.name !== change.name);
        break;
      case 'renamed': {
        // Rename in place. If the target name already exists (best-effort
        // backend rename racing an authoritative snapshot), drop the stale
        // occupant first so the projection never yields two entries with the
        // same name → same React key. No-op when `from` is absent (nothing to
        // rename), preserving the target untouched.
        const hasFrom = entries.some((e) => e.name === change.from);
        if (hasFrom) {
          entries = entries
            .filter((e) => e.name !== change.to || e.name === change.from)
            .map((e) => (e.name === change.from ? { ...e, name: change.to } : e));
        }
        break;
      }
    }
  }
  const next = new Map(cache);
  next.set(key, entries);
  return next;
}

// ── anti-stale rules (frontend.md) ──────────────────────────────────────────

/**
 * Whether `key` is `ancestorKey` itself or a descendant of it (same pe_id,
 * relative path equal or prefixed by `ancestorRel + '/'`). An empty
 * `ancestorRel` (pe root) matches the whole pe.
 */
export function isDescendantOrSelf(key: PeKey, ancestorKey: PeKey): boolean {
  const a = keyToRef(ancestorKey);
  const k = keyToRef(key);
  if (a.pe_id !== k.pe_id) return false;
  if (a.relative_path === k.relative_path) return true;
  const prefix = a.relative_path === '' ? '' : `${a.relative_path}/`;
  return k.relative_path.startsWith(prefix) && (prefix !== '' || k.relative_path !== '');
}

/** Keys in `keys` that are `rootKey` or below it (subtree). */
export function subtreeKeys(keys: Iterable<PeKey>, rootKey: PeKey): PeKey[] {
  const out: PeKey[] = [];
  for (const key of keys) if (isDescendantOrSelf(key, rootKey)) out.push(key);
  return out;
}

/**
 * Rewrite a key whose relative path is `fromRel` or under `fromRel/` to sit
 * under `toRel` instead (same pe_id). Returns the key unchanged if it does not
 * fall under `fromKey`.
 */
export function migrateKey(key: PeKey, fromKey: PeKey, toKey: PeKey): PeKey {
  const from = keyToRef(fromKey);
  const to = keyToRef(toKey);
  const k = keyToRef(key);
  if (k.pe_id !== from.pe_id) return key;
  if (k.relative_path === from.relative_path) return toKey;
  const prefix = from.relative_path === '' ? '' : `${from.relative_path}/`;
  if (prefix !== '' && k.relative_path.startsWith(prefix)) {
    const tail = k.relative_path.slice(from.relative_path.length); // includes leading '/'
    return peKey(to.pe_id, `${to.relative_path}${tail}`);
  }
  return key;
}

// ── tree projection ─────────────────────────────────────────────────────────

/**
 * A pe root's folder availability, mirrored from the backend `runtime_status`
 * (kept as a local union so this pure model stays import-free). Only carried on
 * root nodes; used to grey out / flag unreachable roots.
 */
export type RootRuntimeStatus = 'available' | 'missing' | 'permission_denied' | 'disconnected';

/** A pe root's role: the immutable workspace vs a removable attached folder. */
export type RootRole = 'workspace' | 'attached';

/**
 * Whether a pe root may be removed from the project. Only attached folders are
 * removable; the workspace root is immutable (the agent's cwd anchor). Guards
 * both by role and by pe_id === workspace_pe_id (defensive against a mislabeled
 * role).
 */
export function canRemoveRoot(role: RootRole | undefined, peId: string, workspacePeId?: string): boolean {
  return role === 'attached' && peId !== workspacePeId;
}

/** One arco `Tree` node produced by the projection. */
export type TreeNode = {
  key: PeKey;
  title: string;
  isLeaf: boolean;
  excluded?: boolean;
  children?: TreeNode[];
  /** Root-only: role of the pe root (workspace pinned/immutable vs attached). */
  role?: RootRole;
  /** Root-only: folder availability, for greying-out unreachable roots. */
  runtimeStatus?: RootRuntimeStatus;
};

/** A project's pe root as fed to the projection (title = display name). */
export type RootRef = {
  pe_id: string;
  title: string;
  /** Role — drives pin/immutability (workspace) vs removability (attached). */
  role?: RootRole;
  /** Folder availability — projected onto the root node for status display. */
  runtimeStatus?: RootRuntimeStatus;
};

/**
 * Project the fact cache + expanded set into arco `Tree` data. Starts at each
 * pe root; an expanded directory pulls its one level of children from the cache
 * and recurses; an unexpanded directory is not descended (lazy). Node key is the
 * PeKey. `isLeaf` from `kind === 'file'`.
 */
/**
 * Display order for a directory's children: directories first, then everything
 * else (files, symlinks — grouped with files, matching the `isLeaf = !isDir`
 * projection), each group sorted by name case-insensitively (locale-aware,
 * `sensitivity: 'base'`). Applied at projection time so both snapshots and
 * delta-added nodes land in the right place with no extra ordering to maintain
 * in the fact cache. Does not reorder pe roots (kept in their backend
 * `order_index`).
 */
function compareEntriesForDisplay(a: Entry, b: Entry): number {
  const aDir = a.kind === 'dir';
  const bDir = b.kind === 'dir';
  if (aDir !== bDir) return aDir ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function buildTreeData(cache: FactCache, expanded: ReadonlySet<PeKey>, roots: RootRef[]): TreeNode[] {
  const buildChildren = (peId: string, dirRel: string): TreeNode[] | undefined => {
    const key = peKey(peId, dirRel);
    if (!expanded.has(key)) return undefined; // lazy: do not descend unexpanded dirs
    const entries = cache.get(key);
    if (!entries) return undefined; // expanded but listing not yet arrived
    // Sort a copy — never mutate the cached listing.
    return entries
      .slice()
      .sort(compareEntriesForDisplay)
      .map((entry) => {
        const childRel = joinRel(dirRel, entry.name);
        const isDir = entry.kind === 'dir';
        const node: TreeNode = {
          key: peKey(peId, childRel),
          title: entry.name,
          isLeaf: !isDir,
        };
        if (entry.excluded) node.excluded = true;
        if (isDir) {
          const children = buildChildren(peId, childRel);
          if (children) node.children = children;
        }
        return node;
      });
  };

  return roots.map((root) => {
    const node: TreeNode = {
      key: peKey(root.pe_id, ''),
      title: root.title,
      isLeaf: false,
    };
    if (root.role) node.role = root.role;
    if (root.runtimeStatus) node.runtimeStatus = root.runtimeStatus;
    const children = buildChildren(root.pe_id, '');
    if (children) node.children = children;
    return node;
  });
}

// ── File operations (A): pure request builders ──────────────────────────────
// The tree only knows `{pe_id, relative_path}`, so file ops map to WS fs/*
// commands over that identity (never absolute paths). Scope mirrors the legacy
// tree's context menu: rename + delete only (no new-file/new-folder — the old
// tree never had those). Builders are pure so the path math + no-op detection
// can be unit-tested away from the UI.

/** A rename dialog request. `origRel` is the full pe-relative path being renamed. */
export type RenameRequest = {
  peId: string;
  /** Target parent dir (pe-relative) — the renamed entry stays in place. */
  targetDir: string;
  /** Full pe-relative path of the entry being renamed. */
  origRel: string;
};

export type FsOpRequest = { method: string; params: Record<string, unknown> };

/** Parent directory of a pe-relative path (`''` for a top-level entry). */
export function parentRel(relativePath: string): string {
  const i = relativePath.lastIndexOf('/');
  return i >= 0 ? relativePath.slice(0, i) : '';
}

/**
 * Build the WS fs/rename request. Returns `null` for a no-op — an
 * empty/whitespace name, or a target equal to the original — so the caller
 * skips the round-trip.
 */
export function buildRenameRequest(dialog: RenameRequest, rawName: string): FsOpRequest | null {
  const name = rawName.trim();
  if (!name) return null;
  const rel = joinRel(dialog.targetDir, name);
  if (rel === dialog.origRel) return null;
  const ref = (relative_path: string) => ({ pe_id: dialog.peId, relative_path });
  return { method: 'fs/rename', params: { from: ref(dialog.origRel), to: ref(rel) } };
}

/** Build the WS fs/remove request for deleting an entry. */
export function buildRemoveRequest(peId: string, relativePath: string): FsOpRequest {
  return { method: 'fs/remove', params: { target: { pe_id: peId, relative_path: relativePath } } };
}
