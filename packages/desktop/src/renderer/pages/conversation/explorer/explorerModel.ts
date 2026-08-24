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
  | { op: 'renamed'; from: string; to: string }
  /**
   * An existing entry's contents changed. Carries no timestamp by design — it says
   * that something changed, not what it now is, so a consumer re-reads rather than
   * trusting a value from the notification.
   *
   * The directory listing is unaffected (the entry is already in it), so the fact
   * cache ignores this op; it exists for consumers watching a particular file, such
   * as the preview panel's refresh indicator.
   */
  | { op: 'modified'; name: string };

/**
 * `fs/delta`: apply incremental changes to one directory's listing. Unknown
 * directory (not cached) is left untouched. Returns a new cache.
 *
 * Ops this build does not know are skipped, which is what lets the backend ship a new
 * op before the frontend handles it. The cost is that the gap is invisible: `modified`
 * was being sent and dropped here for several rounds of work before anyone noticed,
 * because silently ignoring it looks exactly like it never arriving. Hence the warning
 * — still no throw, so a newer backend keeps working, but the drift says so once.
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
      case 'modified':
        // Contents changed, listing did not — nothing for the fact cache to do. The
        // preview panel is the consumer that cares (see monitorTransport's fan-out).
        break;
      default:
        warnUnknownDeltaOp(change);
        break;
    }
  }
  const next = new Map(cache);
  next.set(key, entries);
  return next;
}

/** Ops already reported, so a stream of them does not bury everything else. */
const reportedUnknownOps = new Set<string>();

/**
 * Say once, per op, that the backend sent something this build does not handle.
 *
 * Once rather than every time: an unknown op typically arrives with every delta for the
 * rest of the session, and a console full of one repeated line gets skipped as noise.
 */
function warnUnknownDeltaOp(change: Change): void {
  const op = String((change as { op?: unknown }).op);
  if (reportedUnknownOps.has(op)) return;
  reportedUnknownOps.add(op);
  console.warn(
    `[explorer] ignoring unknown fs/delta op "${op}" — this build does not handle it, so the change is not reflected. The frontend is behind the backend's protocol.`
  );
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
      .toSorted(compareEntriesForDisplay)
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
// commands over that identity (never absolute paths). Scope: rename + delete,
// plus create-file / create-dir inside a directory node. Builders are pure so
// the path math + no-op detection can be unit-tested away from the UI.

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

/**
 * Build the WS `fs/mkdir` request to create a directory named `rawName` inside
 * `parentDir` (pe-relative; `''` = the pe root). Returns `null` for an
 * empty/whitespace name so the caller skips the round-trip and just closes the
 * dialog, mirroring `buildRenameRequest`'s no-op handling. `name` is a single
 * segment joined under `parentDir`; the backend's lexical + realpath containment
 * guard rejects any escape, and the parent dir's subscription delivers the
 * `added` delta that materializes the new node.
 */
export function buildMkdirRequest(peId: string, parentDir: string, rawName: string): FsOpRequest | null {
  const name = rawName.trim();
  if (!name) return null;
  return { method: 'fs/mkdir', params: { dir: { pe_id: peId, relative_path: joinRel(parentDir, name) } } };
}

/**
 * Build the WS `fs/createFile` request to create an empty file named `rawName`
 * inside `parentDir`. Same no-op-on-empty and containment semantics as
 * `buildMkdirRequest`; the backend `create_new` open fails rather than
 * truncating if the name is already taken.
 */
export function buildCreateFileRequest(peId: string, parentDir: string, rawName: string): FsOpRequest | null {
  const name = rawName.trim();
  if (!name) return null;
  return { method: 'fs/createFile', params: { file: { pe_id: peId, relative_path: joinRel(parentDir, name) } } };
}

// ── Drag-to-copy/move (source B/C): pure model ──────────────────────────────
// A tree node can be dragged onto a directory node to copy or move it there.
// The payload rides a custom drag MIME so an internal drag is distinguishable
// from an OS-file drop (which carries `Files`). Op selection, guards, and the
// request shape are all pure so the full dragStart→dragOver→drop sequence can be
// replayed in a headless test.

/** Copy vs move — the two transfer directions distinguished by modifier key. */
export type TransferOp = 'copy' | 'move';

/** Custom drag MIME carrying an internal pe-ref (vs an OS `Files` drop). */
export const PE_REF_DRAG_MIME = 'application/x-aionui-pe-ref';

/** The dragged node's identity + display facts, serialized onto the drag MIME. */
export type DragPeRef = {
  pe_id: string;
  relative_path: string;
  name: string;
  isDir: boolean;
};

/** Serialize a dragged node to the drag-transfer string. */
export function serializePeRef(ref: DragPeRef): string {
  return JSON.stringify(ref);
}

/**
 * Parse the drag-transfer string back to a `DragPeRef`. Returns `null` for
 * anything malformed (an OS-file drop, a foreign app's payload, a truncated
 * string), so the caller falls back to the OS-file path.
 */
export function parsePeRef(raw: string): DragPeRef | null {
  try {
    const obj = JSON.parse(raw) as Partial<DragPeRef>;
    if (
      obj &&
      typeof obj.pe_id === 'string' &&
      typeof obj.relative_path === 'string' &&
      typeof obj.name === 'string' &&
      typeof obj.isDir === 'boolean'
    ) {
      return { pe_id: obj.pe_id, relative_path: obj.relative_path, name: obj.name, isDir: obj.isDir };
    }
  } catch {
    // Not our JSON — treat as absent.
  }
  return null;
}

/**
 * Whether the copy modifier is held, per OS convention: Option (Alt) on macOS,
 * Ctrl elsewhere. The base drag (no modifier) is move within a pe and copy
 * across pes; the modifier flips that (see `resolveTransferOp`).
 */
export function isCopyModifierPressed(e: { altKey: boolean; ctrlKey: boolean }, isMac: boolean): boolean {
  return isMac ? e.altKey : e.ctrlKey;
}

/**
 * Resolve the transfer op from context. Within one pe the default gesture is a
 * move (Finder/Explorer convention for same-volume drag); across pes the default
 * is a copy (cross-volume convention). The modifier inverts the default either
 * way, so the same key always means "the other thing".
 */
export function resolveTransferOp(samePe: boolean, copyModifier: boolean): TransferOp {
  const base: TransferOp = samePe ? 'move' : 'copy';
  if (!copyModifier) return base;
  return base === 'move' ? 'copy' : 'move';
}

/**
 * Whether dropping `source` into directory `target` as `op` is a legal transfer.
 * Blocks the two shapes the backend also rejects, but here they gate the drop
 * cursor so the user sees it is disallowed before releasing:
 *   1. Into itself or its own subtree (same pe) — a dir cannot contain itself.
 *   2. A move into the source's current parent — a no-op (copy there is allowed,
 *      producing an auto-renamed duplicate, matching Finder's option-drag).
 * A pe root (`relative_path === ''`) is never a valid drag source (it is a
 * binding, not an entry) — its whole-pe subtree makes case 1 reject it.
 */
export function isTransferAllowed(source: DragPeRef, target: DirRef, op: TransferOp): boolean {
  if (source.relative_path === '') return false; // pe root is not a draggable entry
  if (isDescendantOrSelf(peKey(target.pe_id, target.relative_path), peKey(source.pe_id, source.relative_path))) {
    return false;
  }
  if (op === 'move' && source.pe_id === target.pe_id && parentRel(source.relative_path) === target.relative_path) {
    return false;
  }
  return true;
}

/**
 * Build the WS `fs/copy` / `fs/move` request. `from` is the dragged node's
 * identity; `toDir` is the *target directory* — the backend preserves the source
 * basename and auto-renames on collision (`name copy`, `name copy 2`, …), so the
 * front end never computes the destination path (it lacks absolute paths and
 * would race the tree). Guard with `isTransferAllowed` before calling.
 */
export function buildTransferRequest(op: TransferOp, from: DirRef, toDir: DirRef): FsOpRequest {
  const method = op === 'copy' ? 'fs/copy' : 'fs/move';
  return {
    method,
    params: {
      from: { pe_id: from.pe_id, relative_path: from.relative_path },
      to_dir: { pe_id: toDir.pe_id, relative_path: toDir.relative_path },
    },
  };
}

// ── Context menu structure: pure section builder ─────────────────────────────
// The right-click / more-menu items are grouped into ordered sections drawn with
// a divider line between them. Which items are enabled depends on the node (file
// vs directory vs pe root) and the runtime (some actions are desktop-only), so
// the section computation is pure and table-driven: the panel resolves each
// capability to a boolean and this returns the ordered, non-empty sections.

/** A context-menu action key (stable; also the arco `Menu.Item` key). */
export type ExplorerMenuItemKey =
  | 'addToChat'
  | 'revealInFolder'
  | 'copyRelativePath'
  | 'copyAbsolutePath'
  | 'refresh'
  | 'newFile'
  | 'newDir'
  | 'rename'
  | 'delete'
  | 'remove';

/** Whether each context-menu action is enabled for the current node + runtime. */
export type ExplorerMenuCaps = Record<ExplorerMenuItemKey, boolean>;

/**
 * The context menu grouped into ordered sections:
 *   1. add-to-chat
 *   2. read-only utilities (open location, copy relative, copy absolute, refresh)
 *   3. mutate (new file, new dir, rename, delete, remove-from-project)
 * `refresh` is a root-only reload (re-fetch the pe root's listings); it sits with
 * the other non-mutating node utilities rather than the mutate group so it never
 * neighbours the destructive remove/delete. Only enabled items appear, and only
 * non-empty sections are returned — so the caller draws a divider simply between
 * adjacent returned sections, and the "only between two non-empty sections, never
 * leading/trailing/doubled" property falls out of dropping the empty sections
 * here. Returns `[]` when no action is enabled (the node then shows no menu at all).
 */
export function explorerContextMenuSections(caps: ExplorerMenuCaps): ExplorerMenuItemKey[][] {
  const sections: ExplorerMenuItemKey[][] = [
    ['addToChat'],
    ['revealInFolder', 'copyRelativePath', 'copyAbsolutePath', 'refresh'],
    ['newFile', 'newDir', 'rename', 'delete', 'remove'],
  ];
  return sections.map((keys) => keys.filter((key) => caps[key])).filter((keys) => keys.length > 0);
}
