/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure model for the Source Control front end (see
 * `formal/runtime/source-control.md`, wire types in `protocol.md` §源代码控制).
 * No I/O, no WS, no React: the wire types, the forward-compatible state
 * classification, and the display-layer grouping. The store wires this to the
 * `scm/*` client and `useSyncExternalStore`.
 *
 * Two contract properties drive everything here:
 *
 *  - `ScmResourceState` is an **open set** — an unrecognized `state` must be
 *    rendered as opaque/blocked, never coerced into a regular state. Treating an
 *    unknown state as `modified` would offer actions on something we do not
 *    understand (a data-safety problem, source-control.md §变更清单).
 *  - the wire is **flat per-resource, never pre-grouped** — staged/unstaged
 *    grouping is derived here from `capabilities.staging`, so a provider without
 *    a staging area lands as a single change list with no staging concept.
 */

/** File identity on the wire: pe-relative, never canonical (protocol.md). */
export type ScmFileRef = {
  pe_id: string;
  relative_path: string;
};

/** Neutral content anchor for diff/original. `staged` needs `staging`. */
export type ContentRef = 'working' | 'committed' | 'staged';

/** Optional provider capabilities; UI is gated on these (source-control.md). */
export type ScmCapabilities = {
  staging: boolean;
  local_branches: boolean;
  history_graph: boolean;
  remote_ops: boolean;
};

export type ScmRepository = {
  repo_id: string;
  provider_id: string;
  /** repo root = `{ pe_id, relative_path: '' }`. */
  root: ScmFileRef;
  label: string;
  /**
   * Human-facing project-explorer name of this repo's root, when the backend knows
   * one (wire field `pe_name`, aligned with backend W-1). Optional because it is an
   * open-set enrichment: a provider that cannot supply it simply omits it, and the
   * UI falls back to `label`. Never assume it is present.
   */
  pe_name?: string;
  head?: ScmHead;
  /**
   * Whether this repository is a linked worktree rather than a primary clone (wire
   * field `is_worktree`, aioncore `types.rs`). Only surfaced under one-level workspace
   * discovery; the backend omits it entirely when `false`, so it is optional and a
   * missing value means "not a worktree". Never assume it is present.
   */
  is_worktree?: boolean;
  /**
   * When this is a linked worktree **and** its primary repository is also in the same
   * project's surfaced set, the primary repository's `repo_id` (wire field `worktree_of`,
   * aioncore `types.rs`). Omitted when the primary is outside the current view — the
   * client then renders the worktree at the outer level. Matched by real git directory
   * upstream, never by path text; the client treats it as an opaque id.
   */
  worktree_of?: string;
  capabilities: ScmCapabilities;
  state: 'idle' | 'refreshing' | 'operation' | 'error';
};

/**
 * The repository HEAD: branch name and whether it is detached (wire `ScmHead`,
 * aioncore `types.rs`). Both fields are optional — a provider that cannot resolve
 * a branch name omits it, and `detached` defaults to false when absent.
 */
export type ScmHead = { name?: string; detached?: boolean };

/** The resource states this build knows about. */
export type ScmKnownResourceState = 'created' | 'modified' | 'deleted' | 'conflicted' | 'renamed';

/**
 * Neutral resource state. The known states unioned with `string` because the wire
 * set is **open** (protocol.md: 消费方须容未知值): an unrecognized value must
 * type-check into this field rather than force a cast at the boundary, since
 * receiving one is contract-compliant, not an error.
 */
export type ScmResourceState = ScmKnownResourceState | (string & {});

export type ScmResource = {
  file: ScmFileRef;
  repo_relative_path: string;
  state: ScmResourceState;
  /** Only carried by staging providers: true = staged, false = unstaged. */
  staged?: boolean;
  /** Present when `state === 'renamed'`; the pre-rename repo-relative path. */
  rename_from?: string;
};

export type ScmStatus = {
  /** Identity of the repo this snapshot belongs to — a pure reference, no state. */
  repository: { repo_id: string };
  resources: ScmResource[];
  /**
   * HEAD at the time of this snapshot (wire `ScmStatus.head`, top-level and sibling
   * to `resources`/`seq`, per aioncore `types.rs`; `skip_serializing_if none`). It is
   * a property of the snapshot, not of the repo identity, so it lives here rather than
   * on `repository`. Optional: a status push after e.g. a terminal `checkout` carries
   * it so the branch display updates without a separate `repositoriesChanged` frame,
   * but a provider that cannot supply it omits it — never assume it is present.
   */
  head?: ScmHead;
  /** Per-repo monotonic sequence; older frames are dropped by the store. */
  seq: number;
  truncated?: boolean;
  degraded?: boolean;
};

export type ScmRepositoriesChanged = {
  /**
   * The project this delta belongs to (wire field `project_id`, snake; the backend
   * always sends it). The notification stream is not per-project while the store is,
   * so a consumer must drop any frame whose `project_id` is not the open one.
   */
  project_id: string;
  added?: ScmRepository[];
  removed?: string[];
  changed?: ScmRepository[];
};

// ── state classification (forward-compatible) ───────────────────────────────

/**
 * How a resource state is rendered and whether actions may be offered.
 *
 *  - `regular`    — created / modified / deleted: actions allowed (PR-4).
 *  - `renamed`    — shows `rename_from → path`; actions allowed.
 *  - `conflicted` — rendered distinctly, **no actions** in stage 1: folding it
 *    into `modified` would let a user stage or discard a half-resolved merge.
 *  - `opaque`     — a state this build does not know (open set): display only.
 */
export type ScmResourceKind = 'regular' | 'renamed' | 'conflicted' | 'opaque';

const REGULAR_STATES = new Set(['created', 'modified', 'deleted']);

/**
 * Classify a wire `state`. Anything outside the known set is `opaque` — the
 * forward-compatibility rule from protocol.md (未知 state 前向兼容). Note that
 * `conflicted` is *known* yet still action-blocked, so "blocked" and "unknown"
 * are deliberately distinct kinds rather than one flag.
 */
export const classifyResourceState = (state: ScmResourceState): ScmResourceKind => {
  if (REGULAR_STATES.has(state)) return 'regular';
  if (state === 'renamed') return 'renamed';
  if (state === 'conflicted') return 'conflicted';
  return 'opaque';
};

/** Whether this resource may be offered stage/unstage/discard actions (PR-4). */
export const isActionable = (resource: ScmResource): boolean => {
  const kind = classifyResourceState(resource.state);
  return kind === 'regular' || kind === 'renamed';
};

// ── identity ────────────────────────────────────────────────────────────────

/**
 * Stable-enough row identity for React keys. The `staged` flag is part of the key
 * on purpose: git can report the same file twice in one frame (one staged entry
 * and one unstaged entry, source-control.md §变更清单), so `pe_id + path` alone is
 * not unique within a status frame.
 *
 * All **three** states of the flag get distinct keys — `true` / `false` /
 * **absent**. Collapsing absent into `false` would let a flagless row (an opaque
 * state, which has no staging side at all) collide with a genuine unstaged row for
 * the same path, so React would treat two different rows as one and selecting the
 * conflicted row could highlight the unstaged one.
 */
export const resourceKey = (resource: ScmResource): string => {
  const side = resource.staged === true ? 's' : resource.staged === false ? 'u' : 'n';
  return `${resource.file.pe_id}\0${resource.file.relative_path}\0${side}`;
};

// ── display-layer grouping (derived from capabilities) ──────────────────────

/**
 * Display group ids.
 *
 * `blocked` is not a staging group: it holds the resources a staging provider
 * reported **without** a `staged` flag. Per protocol.md v10 (`ScmResource.staged`)
 * such a resource has no "which side" at all — an opaque state like `conflicted`
 * is neither staged nor unstaged — and must be shown "unassignable to a group,
 * with no staging action", never defaulted to either side.
 */
export type ScmGroupId = 'staged' | 'unstaged' | 'changes' | 'blocked';

export type ScmGroup = {
  id: ScmGroupId;
  resources: ScmResource[];
};

/**
 * Derive the display groups for one repo's flat resource list.
 *
 * Without `staging` there is a single `changes` group — a provider with no
 * staging area must not show a staging concept at all.
 *
 * With `staging` the list splits three ways:
 *
 *  - `staged` / `unstaged` — per the resource's explicit `staged` flag;
 *  - `blocked` — resources whose `staged` flag is **absent**. This is not an
 *    off-contract frame: protocol.md v10 states a staging provider also omits the
 *    flag for opaque states (`conflicted` has no "which side"). Defaulting such a
 *    row into `unstaged` would keep it visible but also hand it a stage button
 *    that the backend is guaranteed to reject with `-32053 resource_blocked` — so
 *    it gets its own group instead: still listed (it is the row telling the user
 *    to resolve the conflict externally), but outside the staging split.
 *
 * Empty groups are dropped so no empty header renders.
 */
export const groupResources = (resources: ScmResource[], staging: boolean): ScmGroup[] => {
  if (!staging) {
    return resources.length > 0 ? [{ id: 'changes', resources }] : [];
  }
  const staged = resources.filter((r) => r.staged === true);
  const unstaged = resources.filter((r) => r.staged === false);
  // Neither side: `staged` absent. Kept visible, kept out of the staging split.
  const blocked = resources.filter((r) => r.staged === undefined);
  const groups: ScmGroup[] = [];
  if (staged.length > 0) groups.push({ id: 'staged', resources: staged });
  if (unstaged.length > 0) groups.push({ id: 'unstaged', resources: unstaged });
  if (blocked.length > 0) groups.push({ id: 'blocked', resources: blocked });
  return groups;
};

/**
 * The `ContentRef` pair to diff a resource against, per source-control.md
 * §diff/original:
 *
 *  - a staged row     → `staged` vs `committed` (what the commit would contain);
 *  - an unstaged row  → `working` vs `staged` when there is a staging area,
 *                       else `working` vs `committed`.
 *
 * A resource with **no** `staged` flag under a staging provider (an opaque state
 * such as `conflicted`) falls back to `committed` vs `working`. This is required by
 * protocol.md v11, not a nicety: a conflicted file's index holds only the three
 * conflict sides (base / ours / theirs) and **no resolved version at stage 0**, so
 * requesting the `staged` anchor is not rejected — it succeeds and returns **empty
 * content**. Rendering that would tell the user "this file is empty", which is
 * worse than an error: an error is a signal, an empty diff looks like a result.
 *
 * `from`/`to` follow the wire's argument order (`from` = older side).
 */
export const diffAnchors = (resource: ScmResource, staging: boolean): { from: ContentRef; to: ContentRef } => {
  if (staging && resource.staged === true) return { from: 'committed', to: 'staged' };
  if (staging && resource.staged === false) return { from: 'staged', to: 'working' };
  return { from: 'committed', to: 'working' };
};

/** Display name of a resource row (basename of its repo-relative path). */
export const resourceName = (resource: ScmResource): string => {
  const path = resource.repo_relative_path || resource.file.relative_path;
  return path.split('/').pop() || path;
};

/** Parent directory of a resource row, for the dimmed secondary label. */
export const resourceDir = (resource: ScmResource): string => {
  const path = resource.repo_relative_path || resource.file.relative_path;
  const idx = path.lastIndexOf('/');
  return idx < 0 ? '' : path.slice(0, idx);
};

// ── action failure attribution (used by PR-4; contract-derived) ─────────────

/** The three multi-file actions. One request carries exactly one of them. */
export type ScmActionKind = 'stage' | 'unstage' | 'discard';

/** One entry of an action response's `failed[]` (protocol.md §源代码控制). */
export type ScmActionFailure = {
  file: ScmFileRef;
  /** Display-only text. Never parsed — it is a raw engine message whose wording
   *  varies by platform and dependency version, so any branching on it is fragile. */
  reason: string;
};

/**
 * Which staging side an action operates on.
 *
 * Fixed by the contract (protocol.md v11 §源代码控制): `scm/stage` acts on the
 * unstaged side, `scm/unstage` on the staged side, `scm/discard` on the unstaged
 * side. A request cannot express "operate on this particular resource" — it names
 * one method, and the method determines the side.
 *
 * That is exactly what makes a failure attributable without a per-failure flag:
 * «the action's side» + «the path» identifies one rendered row. "The same file
 * failed on one side but not the other" is always **two separate requests**, each
 * with its own `failed[]`, so the two can never mix inside one response.
 */
export const actionSide = (action: ScmActionKind): boolean => action === 'unstage';

/**
 * Resolve an action's `failed[]` back to the exact rows that failed.
 *
 * Identity = `{ pe_id, relative_path }` from the failure **plus** the side implied
 * by the action. Rows are matched inside `rows` (the resources that were sent), so
 * a failure marks precisely one row even when the same path also appears on the
 * other side of the staging split.
 *
 * Returns the matching rows' `resourceKey`s. A failure that matches nothing (the
 * status frame moved on) is simply not returned — the caller still reports it by
 * path in the summary, so it is never silently dropped.
 */
export const failedRowKeys = (failures: ScmActionFailure[], rows: ScmResource[], action: ScmActionKind): string[] => {
  const side = actionSide(action);
  const keys: string[] = [];
  for (const failure of failures) {
    const row = rows.find(
      (r) =>
        r.file.pe_id === failure.file.pe_id && r.file.relative_path === failure.file.relative_path && r.staged === side
    );
    if (row) keys.push(resourceKey(row));
  }
  return keys;
};

/**
 * Whether discarding this row means "move to the OS trash" (recoverable) rather
 * than "restore over the working-tree content" (not recoverable).
 *
 * Only a row that exists **nowhere but the working tree** goes to the trash. A
 * `created` row that is already staged does not: it has a staged version, so
 * discarding restores from the index — which holds even in a repository with no
 * commits at all (source-control.md §空仓边界: an unborn HEAD still has an index,
 * so discard is the same rule, not a special case).
 */
const isUntrackedForDiscard = (r: ScmResource): boolean => r.state === 'created' && r.staged !== true;

/**
 * Split a discard selection by how irreversible it is, so the confirmation can
 * state the consequence that actually applies:
 *
 *  - **untracked** — the file goes to the OS trash, so the user can retrieve it;
 *  - **tracked** — the content is restored from the staged version (or, with
 *    nothing staged, the last commit), **overwriting the user's edit with no way
 *    back**.
 *
 * Neither sentence is true of a mixed selection, which is why the caller has a
 * third, combined wording rather than picking the "worse" one.
 */

export const splitDiscardRisk = (resources: ScmResource[]): { tracked: ScmResource[]; untracked: ScmResource[] } => ({
  tracked: resources.filter((r) => !isUntrackedForDiscard(r)),
  untracked: resources.filter(isUntrackedForDiscard),
});

/**
 * The rows of a selection an action may actually be sent for.
 *
 * Non-actionable rows (`conflicted`, or any state this build does not recognise)
 * are dropped rather than sent: the backend refuses the **whole** request with
 * `-32053 resource_blocked` when even one conflicted file is included, which would
 * silently turn "stage these five files" into "nothing happened".
 */
export const actionableResources = (resources: ScmResource[]): ScmResource[] => resources.filter(isActionable);
