/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Source Control store — module-level state with a `useSyncExternalStore`
 * surface, following the `explorerStore` / `searchStore` pattern. See
 * `formal/runtime/frontend.md` §源代码控制 store.
 *
 * This store is deliberately **much simpler than the explorer's**: SCM status is
 * a value the backend recomputes from scratch against index/HEAD, has no stable
 * per-item identity, and is pushed as whole frames. So there is no fact-cache
 * reconcile machine and no incremental application here — only:
 *
 *  1. **whole-frame replace** of a repo's status, and
 *  2. a **`appliedSeq` guard** that drops any frame not newer than what is
 *     already applied. Two independent refresh sources (an action's refresh and
 *     the watcher's debounced refresh) can arrive out of order; without the guard
 *     a stale frame would repaint the panel back to an older truth.
 *
 * Subscription lifetime is **project-scoped, not tab-scoped**: switching between
 * the Files and Changes tabs must NOT unsubscribe (the watch and cache stay warm
 * so switching back is instant). Only switching project, closing it, or a
 * reconnect releases the subscription.
 */

import { useSyncExternalStore } from 'react';

import { RPC_DISCONNECTED, RpcError } from '../explorer/monitorClient';
import type {
  ContentRef,
  ScmActionFailure,
  ScmActionKind,
  ScmFileRef,
  ScmHead,
  ScmRepositoriesChanged,
  ScmRepository,
  ScmResource,
  ScmStatus,
} from './scmModel';
import { failedRowKeys } from './scmModel';

/** `scm/diff` result (protocol.md §源代码控制). */
export type ScmDiffResult = {
  patch?: string;
  original?: string;
  modified?: string;
  binary?: boolean;
  truncated?: boolean;
};

/**
 * Response of `scm/stage` / `scm/unstage` / `scm/discard`.
 *
 * Best-effort per file: an omitted or empty `failed` means every file was
 * processed; **successful files are never listed**. A non-empty `failed` therefore
 * means *partial success* — the files NOT listed have really been changed already.
 */
export type ScmActionResult = {
  failed?: ScmActionFailure[];
};

/**
 * The request side the store rides, injected so every path here is testable
 * without a socket (same seam as `MonitorPort` / `SearchPort`).
 */
export type ScmPort = {
  listRepositories: (projectId: string) => Promise<{ repositories: ScmRepository[] }>;
  subscribe: (repoIds: string[]) => Promise<{ statuses: ScmStatus[] }>;
  unsubscribe: (repoIds: string[]) => void;
  status: (repoId: string) => Promise<ScmStatus>;
  diff: (params: { repository: string; file: ScmFileRef; from: ContentRef; to: ContentRef }) => Promise<ScmDiffResult>;
  /** One of `scm/stage` | `scm/unstage` | `scm/discard`, chosen by `action`. */
  act: (action: ScmActionKind, params: { repository: string; files: ScmFileRef[] }) => Promise<ScmActionResult>;
};

export type ScmLoadState = 'idle' | 'loading' | 'ready' | 'error';

/** Immutable view handed to React via `useSyncExternalStore`. */
export type ScmView = {
  projectId: string | null;
  repositories: ScmRepository[];
  /** repo_id → latest applied status frame. */
  statuses: Record<string, ScmStatus>;
  /** Repository list load state (not per-repo status freshness). */
  loadState: ScmLoadState;
  /** Set when `loadState === 'error'`; an i18n-agnostic message for the panel. */
  error?: string;
  /**
   * Which repo's changes the multi-repo panel body shows. `null` means "fall back
   * to the first repo" — the default on open and the landing spot after the selected
   * repo is removed. Pure front-end view state: switching it issues no `scm/*`
   * request (every repo of the project is already subscribed, design D2丙). The view
   * resolves `null`-or-stale to the first repo, so a stale id never renders nothing.
   */
  selectedRepoId: string | null;
  /** Currently selected resource row key (see `resourceKey`), for diff view. */
  selectedResource: string | null;
  /** True while a stage/unstage/discard request is in flight. */
  actionBusy: boolean;
  /**
   * Outcome of the most recent action, or null.
   *
   * Lives in the store, not in the panel's `useState`, because the panel is
   * **unmounted whenever the user switches to the Files tab**. A `partial` report is
   * the only place that says *which files did not succeed* — losing it on a tab
   * switch loses that information permanently, and the files really were changed.
   */
  actionReport: ScmActionReport | null;
};

/**
 * What the UI shows after an action: a message plus the rows to flag.
 *
 * Deliberately pre-rendered strings rather than a raw outcome: the store owns this
 * so it survives the panel unmounting, and the wording is decided in one place
 * (see `useScmActions`) instead of being re-derived by whoever renders it.
 */
export type ScmActionReport = {
  tone: 'success' | 'warning' | 'error';
  message: string;
  /** Extra line listing the paths that were not completed (partial only). */
  detail?: string;
  /** Row keys to mark as failed (partial only). */
  failedRowKeys: string[];
  retryable: boolean;
};

const EMPTY_VIEW: ScmView = {
  projectId: null,
  repositories: [],
  statuses: {},
  loadState: 'idle',
  selectedRepoId: null,
  selectedResource: null,
  actionBusy: false,
  actionReport: null,
};

// ── internal state ──────────────────────────────────────────────────────────

let port: ScmPort | null = null;

let projectId: string | null = null;
let repositories: ScmRepository[] = [];
let statuses = new Map<string, ScmStatus>();
/** repo_id → highest applied `seq`. The anti-reorder guard. */
let appliedSeq = new Map<string, number>();
/** repo_ids declared to the backend via `scm/subscribe`. */
let subscribed = new Set<string>();
let loadState: ScmLoadState = 'idle';
let error: string | undefined;
let selectedRepoId: string | null = null;
let selectedResource: string | null = null;
let actionBusy = false;
let actionReport: ScmActionReport | null = null;
/** The last action's inputs, so `retry` can re-run it after a panel remount. */
let lastAction: { action: ScmActionKind; repoId: string; resources: ScmResource[] } | null = null;

let snapshot: ScmView = EMPTY_VIEW;
const listeners = new Set<() => void>();

const rebuild = (): void => {
  snapshot = {
    projectId,
    repositories,
    statuses: Object.fromEntries(statuses),
    loadState,
    error,
    selectedRepoId,
    selectedResource,
    actionBusy,
    actionReport,
  };
};

const commit = (): void => {
  rebuild();
  for (const listener of listeners) listener();
};

/**
 * Apply one status frame under the seq guard. Returns whether it was applied.
 *
 * The comparison is `>` (strictly newer), not `>=`: re-applying the same seq is
 * never useful and an equal seq means the same computation, so dropping it keeps
 * the store from churning React on duplicate frames.
 */
const applyStatusFrame = (status: ScmStatus): boolean => {
  const repoId = status.repository?.repo_id;
  if (!repoId) return false;
  const applied = appliedSeq.get(repoId);
  if (applied !== undefined && !(status.seq > applied)) return false; // stale/duplicate frame
  appliedSeq.set(repoId, status.seq);
  statuses.set(repoId, status);
  applyHeadFromStatus(repoId, status.head);
  return true;
};

/**
 * Mirror the top-level `head` of a status frame onto the matching `repositories`
 * entry. The branch display (`RepoList`) reads `repo.head` off `repositories`, not
 * the per-repo status frame, so a terminal `checkout` that only triggers a
 * `scm/statusChanged` push would otherwise leave the branch name stale. `head` is
 * open-set optional: a frame that omits it must not clobber a head already learned
 * from `listRepositories` / `repositoriesChanged`, so we only write when the frame
 * actually carries one. The reference is replaced (not mutated) so `useScm`
 * selectors relying on identity re-render.
 */
const applyHeadFromStatus = (repoId: string, head: ScmHead | undefined): void => {
  if (!head) return;
  const index = repositories.findIndex((r) => r.repo_id === repoId);
  if (index === -1) return;
  const current = repositories[index];
  if (current.head?.name === head.name && current.head?.detached === head.detached) return;
  repositories = repositories.map((r) => (r.repo_id === repoId ? { ...r, head } : r));
};

// ── wiring ──────────────────────────────────────────────────────────────────

/** Inject the request side (called once by the runtime wiring). */
export const configureScmStore = (nextPort: ScmPort): void => {
  port = nextPort;
};

// ── inbound notifications ───────────────────────────────────────────────────

/**
 * Route an inbound `scm/*` notification into the store. Unknown methods are
 * ignored (the wire may grow new notifications).
 */
export const applyScmNotification = (method: string, params: unknown): void => {
  if (method === 'scm/statusChanged') {
    const status = params as ScmStatus | undefined;
    if (!status?.repository) return;
    // Guard: a frame for a repo we are not subscribed to is in-flight residue
    // from an unsubscribe (or another project's repo) → drop it.
    if (!subscribed.has(status.repository.repo_id)) return;
    if (applyStatusFrame(status)) commit();
    return;
  }
  if (method === 'scm/repositoriesChanged') {
    applyRepositoriesChanged(params as ScmRepositoriesChanged | undefined);
  }
};

/**
 * Apply a repo add/remove/change delta. Removed repos also drop their status,
 * seq and subscription bookkeeping — leaving the seq behind would make a later
 * re-add of the same repo_id silently discard its (restarted) frames.
 *
 * **Removal wins over a same-frame add/change**, and a self-contradictory frame is
 * logged rather than silently resolved. A frame that both removes and re-adds the
 * same `repo_id` cannot be honoured coherently: whichever order we picked, half the
 * bookkeeping (status / seq / subscription) would disagree with `repositories`, and
 * the result would look like a working panel showing a repo that has no status and
 * is not subscribed. Dropping it is the outcome we can state truthfully; the warn
 * makes the contradiction visible instead of leaving it to be inferred from a repo
 * that never populates.
 */
const applyRepositoriesChanged = (delta: ScmRepositoriesChanged | undefined): void => {
  if (!delta) return;
  // Drop a frame addressed to a different project before touching the store. The
  // status/change stream is shared across a multi-project session while this store
  // holds exactly one project, so another project's added/removed would otherwise
  // corrupt the current view. A malformed frame missing `project_id` also fails this
  // guard (`undefined !== projectId`) and is dropped — the safe outcome.
  if (delta.project_id !== projectId) return;
  const removed = new Set(delta.removed ?? []);
  const byId = new Map(repositories.map((r) => [r.repo_id, r]));

  // `changed` only updates a repo already listed — it must not resurrect one.
  for (const repo of delta.changed ?? []) {
    if (byId.has(repo.repo_id)) byId.set(repo.repo_id, repo);
  }
  for (const repo of delta.added ?? []) byId.set(repo.repo_id, repo);

  for (const repoId of removed) {
    byId.delete(repoId);
    statuses.delete(repoId);
    appliedSeq.delete(repoId);
    subscribed.delete(repoId);
  }

  // If the repo being shown was removed, drop the selection so the view falls back
  // to the first repo. Reset to null (not to a specific id) on purpose: the view
  // derives the fallback, and a null won't resurrect this repo if the same id is
  // re-added later.
  if (selectedRepoId !== null && removed.has(selectedRepoId)) {
    selectedRepoId = null;
    selectedResource = null;
  }

  // A repo named in `removed` AND in `added`/`changed` is a contradictory frame.
  // Removal has already won above; say so, because the alternative is a user
  // staring at a repo that never loads with nothing in the log to explain it.
  const contradictory = [...(delta.added ?? []), ...(delta.changed ?? [])]
    .map((r) => r.repo_id)
    .filter((id) => removed.has(id));
  if (contradictory.length > 0) {
    console.warn('[scm] repositoriesChanged names these repos as both removed and added/changed; removal wins', {
      repos: contradictory,
    });
  }

  repositories = [...byId.values()];
  commit();

  // Newly added repos are not subscribed yet — declare them (the project is open).
  // Computed from the post-removal list on purpose: a removed repo must NOT be
  // re-subscribed here, and `subscribed` no longer contains it either.
  const missing = repositories.map((r) => r.repo_id).filter((id) => !subscribed.has(id));
  if (missing.length > 0) void subscribeRepos(missing);
};

// ── actions ─────────────────────────────────────────────────────────────────

/** Subscribe repos and apply their first status frames under the seq guard. */
const subscribeRepos = async (repoIds: string[]): Promise<void> => {
  if (!port || repoIds.length === 0) return;
  for (const id of repoIds) subscribed.add(id);
  try {
    const result = await port.subscribe(repoIds);
    let changed = false;
    for (const status of result.statuses ?? []) {
      // The project may have been switched while this was in flight.
      const repoId = status.repository?.repo_id;
      if (repoId === undefined || !subscribed.has(repoId)) continue;
      if (applyStatusFrame(status)) changed = true;
    }
    if (changed) commit();
  } catch {
    // Offline / reconnect: `onScmReconnect` clears `subscribed` and re-declares,
    // so a failed subscribe leaves no gap behind.
  }
};

/**
 * Open a project: list its repos and subscribe to all of them.
 *
 * Same-project guard: the hosting container remounts on conversation switches,
 * which must NOT re-list and re-subscribe (that would drop the warm status and
 * flicker the panel). A repeated call for the already-open project is a no-op.
 */
export const openScmProject = async (id: string): Promise<void> => {
  if (projectId === id) return;
  // Release the previous project's repos (switch project = release, per
  // source-control.md §生命周期).
  if (projectId !== null) releaseSubscriptions();
  projectId = id;
  repositories = [];
  statuses = new Map();
  appliedSeq = new Map();
  selectedRepoId = null;
  selectedResource = null;
  error = undefined;
  // Action state is per-project (same reason as in `closeScmProject`): a report
  // saying "these files failed" must not survive onto a different project's list.
  actionBusy = false;
  actionReport = null;
  lastAction = null;
  loadState = 'loading';
  commit();

  if (!port) {
    loadState = 'error';
    error = 'scm port not configured';
    commit();
    return;
  }

  try {
    const result = await port.listRepositories(id);
    if (projectId !== id) return; // switched away while in flight
    repositories = result.repositories ?? [];
    loadState = 'ready';
    commit();
    await subscribeRepos(repositories.map((r) => r.repo_id));
  } catch (e) {
    if (projectId !== id) return;
    loadState = 'error';
    error = e instanceof Error ? e.message : String(e);
    commit();
  }
};

/**
 * Manual re-discovery fallback: re-run `scm/listRepositories` for the OPEN
 * project and reconcile the full result into the live store — WITHOUT the
 * teardown `openScmProject` does (it early-returns for the same project, and
 * would drop warm status besides).
 *
 * This is the only front-end path that surfaces a worktree created mid-session:
 * the backend pushes `repositoriesChanged` only when the project's attached-root
 * set changes — never for a new worktree inside an already-attached repo — and
 * status/focus refresh (`refreshAllRepos`) pull only already-subscribed repos.
 *
 * The full list is diffed into an added/removed/changed delta and fed through the
 * same `applyRepositoriesChanged` reconciliation the push path uses, so the
 * subscribe / unsubscribe / selection bookkeeping is identical across both paths
 * (an unchanged list is therefore a no-op — no re-subscribe, warm status kept).
 */
export const rediscoverRepos = async (): Promise<void> => {
  const pid = projectId;
  if (!port || pid === null) return;
  try {
    const result = await port.listRepositories(pid);
    // Switched project (or closed) while the re-list was in flight: the reply now
    // describes a project this store no longer holds, so drop it.
    if (projectId !== pid) return;
    const next = result.repositories ?? [];
    const currentIds = new Set(repositories.map((r) => r.repo_id));
    const nextIds = new Set(next.map((r) => r.repo_id));
    applyRepositoriesChanged({
      project_id: pid,
      added: next.filter((r) => !currentIds.has(r.repo_id)),
      changed: next.filter((r) => currentIds.has(r.repo_id)),
      removed: [...currentIds].filter((id) => !nextIds.has(id)),
    });
  } catch {
    // A failed re-list leaves the current repository list intact.
  }
};

/** Tell the backend to release every declared repo and forget the declarations. */
const releaseSubscriptions = (): void => {
  const ids = [...subscribed];
  subscribed = new Set();
  if (ids.length > 0) port?.unsubscribe(ids);
};

/**
 * Close the project (project switched away / panel torn down): release watches
 * and drop the cache. Note this is NOT called on tab switches — the Changes tab
 * going invisible keeps the subscription alive by design.
 */
export const closeScmProject = (): void => {
  releaseSubscriptions();
  projectId = null;
  repositories = [];
  statuses = new Map();
  appliedSeq = new Map();
  selectedRepoId = null;
  selectedResource = null;
  loadState = 'idle';
  error = undefined;
  // Action state is per-project: carrying a report across a close would attach one
  // project's "these files failed" to another project's file list.
  actionBusy = false;
  actionReport = null;
  lastAction = null;
  commit();
};

/**
 * Manual / focus refresh: pull one repo's status. Needed because an external
 * editor writing a working-tree file — and editing `.gitignore` itself — produces
 * no `.git` event at all, so the backend watch cannot see it (source-control.md
 * §三信号 ③).
 */
export const refreshRepo = async (repoId: string): Promise<void> => {
  if (!port) return;
  try {
    const status = await port.status(repoId);
    const framedRepoId = status?.repository?.repo_id;
    if (framedRepoId === undefined || !subscribed.has(framedRepoId)) return;
    if (applyStatusFrame(status)) commit();
  } catch {
    // A failed manual refresh leaves the last good frame on screen.
  }
};

/** Refresh every subscribed repo (window focus / refresh button). */
export const refreshAllRepos = async (): Promise<void> => {
  await Promise.all([...subscribed].map((id) => refreshRepo(id)));
};

/** Select (or clear) the resource row whose diff is shown. */
export const selectScmResource = (key: string | null): void => {
  selectedResource = key;
  commit();
};

/**
 * Choose which repo's changes the panel body shows (multi-repo projects).
 *
 * Pure front-end view state: every repo of the open project is already subscribed
 * and its status already in `statuses`, so switching renders from cache with **no
 * `scm/*` request and no latency** (design D2丙). A no-op when the id is unchanged.
 *
 * Clears the open diff on an actual switch: the selected resource belongs to the
 * repo being left, so keeping it would show one repo's patch above another repo's
 * file list.
 */
export const setSelectedRepo = (repoId: string): void => {
  if (selectedRepoId === repoId) return;
  selectedRepoId = repoId;
  selectedResource = null;
  commit();
};

// ── actions (stage / unstage / discard) ─────────────────────────────────────

/**
 * How an action ended. Four-way, because each case needs a different message and
 * only some of them may offer a retry:
 *
 *  - `ok`       — every file processed.
 *  - `partial`  — some files failed, **the rest really were changed**. The message
 *                 must say "N succeeded, these failed"; calling this "the operation
 *                 failed" would invite a retry that re-applies the action to files
 *                 already done (and for a discard, those changes are gone for good
 *                 — on macOS the trash offers no programmatic restore).
 *  - `rejected` — the **server** refused and nothing happened (a protocol error).
 *                 `retryable` says whether trying again could ever help: a
 *                 `-32053 resource_blocked` refusal (conflicted file) can only
 *                 succeed after the user resolves the conflict elsewhere, so
 *                 offering "retry" there is a lie.
 *  - `unknown`  — ⚠️ **the outcome is genuinely unknown to the front end.** The
 *                 transport failed before an answer arrived, so the request may or
 *                 may not have run. This is deliberately NOT folded into
 *                 `rejected`: saying "nothing happened" here would be the front end
 *                 asserting something it cannot know, and for a discard that lie
 *                 costs the user a second irreversible destruction when they redo it.
 *                 `sent` distinguishes the two sub-cases (see `ScmUnknownReason`).
 */
export type ScmActionOutcome =
  | { kind: 'ok'; action: ScmActionKind; total: number }
  | { kind: 'partial'; action: ScmActionKind; total: number; failed: ScmActionFailure[]; failedRowKeys: string[] }
  | { kind: 'rejected'; action: ScmActionKind; total: number; code?: number; retryable: boolean }
  | { kind: 'unknown'; action: ScmActionKind; total: number; reason: ScmUnknownReason };

/**
 * Why an action's outcome is unknown.
 *
 *  - `not-sent`  — the frame never left the client (socket not OPEN). Nothing ran,
 *                  so "please retry" is safe and accurate.
 *  - `no-answer` — the frame went out but the connection reset / the response was
 *                  malformed before we could read it. **The action may have
 *                  completed.** The user must be told to re-check, never to redo.
 */
export type ScmUnknownReason = 'not-sent' | 'no-answer';

/** protocol.md error codes the action paths distinguish. */
export const SCM_ERR_OPERATION_FAILED = -32051;
export const SCM_ERR_CAPABILITY_UNSUPPORTED = -32052;
export const SCM_ERR_RESOURCE_BLOCKED = -32053;

/**
 * Whether retrying a **server-rejected** action could ever succeed.
 *
 * Only an operation that actually ran and broke is worth retrying. A blocked
 * resource stays blocked until the user resolves it, and an unsupported capability
 * is a static property of the provider — retrying either is guaranteed to fail
 * again, so the UI must not offer it.
 */
const isRetryable = (code: number | undefined): boolean => code === SCM_ERR_OPERATION_FAILED;

/**
 * Classify a transport-level failure into "nothing ran" vs "we cannot know".
 *
 * Only `RPC_DISCONNECTED` means the frame was never handed to the socket — the
 * client checks `send()`'s return before registering the request. Everything else
 * (connection reset with the request in flight, a malformed response, an abandoned
 * stream) leaves the outcome genuinely open.
 */
const unknownReasonOf = (code: number): ScmUnknownReason => (code === RPC_DISCONNECTED ? 'not-sent' : 'no-answer');

/**
 * Run a multi-file action and report how it ended.
 *
 * The store deliberately does **not** apply the result to its own state: the
 * backend recomputes and pushes a fresh `scm/statusChanged` (new seq) after every
 * action, and that frame is the single truth. This function's return value exists
 * only so the UI can phrase an accurate message.
 */
export const runScmAction = async (
  action: ScmActionKind,
  repoId: string,
  resources: ScmResource[]
): Promise<ScmActionOutcome> => {
  const total = resources.length;
  if (!port) return { kind: 'rejected', action, total, retryable: false };

  const files = resources.map((r) => ({ pe_id: r.file.pe_id, relative_path: r.file.relative_path }));
  try {
    const result = await port.act(action, { repository: repoId, files });
    const failed = result?.failed ?? [];
    if (failed.length === 0) return { kind: 'ok', action, total };
    return {
      kind: 'partial',
      action,
      total,
      failed,
      // Resolved against the rows that were sent, so a failure marks exactly one
      // row even when the same path also appears on the other staging side.
      failedRowKeys: failedRowKeys(failed, resources, action),
    };
  } catch (e) {
    // A transport-level failure is NOT a rejection: the request may have run.
    // Branching on `transport` (not on the numeric range) keeps this correct when
    // either side adds a code — local pseudo-codes and protocol codes share `code`.
    if (e instanceof RpcError && e.transport) {
      return { kind: 'unknown', action, total, reason: unknownReasonOf(e.code) };
    }
    const code = e instanceof RpcError ? e.code : undefined;
    return { kind: 'rejected', action, total, code, retryable: isRetryable(code) };
  }
};

/**
 * Store-level action state. `busy` and `report` live here (not in the panel's
 * `useState`) because the Changes panel is **unmounted on every switch to the Files
 * tab** — a `partial` report is the only record of which files did not succeed, so
 * losing it on a tab switch loses that information for good.
 *
 * `describe` is injected by the view layer: the wording needs i18n, which the store
 * has no business owning. The store keeps the *result*, the view decides the words.
 */
export const beginScmAction = (action: ScmActionKind, repoId: string, resources: ScmResource[]): void => {
  lastAction = { action, repoId, resources };
  actionBusy = true;
  actionReport = null;
  commit();
};

/** Publish an action's outcome (already rendered to strings by the view layer). */
export const finishScmAction = (report: ScmActionReport | null): void => {
  actionBusy = false;
  actionReport = report;
  commit();
};

/** Dismiss the current report without touching anything else. */
export const clearScmActionReport = (): void => {
  actionReport = null;
  commit();
};

/** The last action's inputs, for `retry`. Survives a panel remount. */
export const getLastScmAction = (): { action: ScmActionKind; repoId: string; resources: ScmResource[] } | null =>
  lastAction;

/** Request a file diff (`scm/diff`). Request-driven: not part of the subscription. */
export const fetchScmDiff = async (params: {
  repository: string;
  file: ScmFileRef;
  from: ContentRef;
  to: ContentRef;
}): Promise<ScmDiffResult> => {
  if (!port) throw new Error('scm port not configured');
  return port.diff(params);
};

/**
 * Reconnect: the backend dropped this connection's whole subscription set, so
 * clear the declared set and re-declare from the repo list (mirrors the
 * explorer's `current = ∅` re-declare). Statuses are kept as stale paint until
 * the fresh first frames arrive.
 *
 * `appliedSeq` is cleared too: seq is per-repo *per backend runtime* and a
 * reconnect may hit a restarted backend whose seq restarts at 1 — keeping the old
 * high-water mark would make the guard discard every fresh frame, leaving the
 * panel permanently stale.
 */
export const onScmReconnect = (): void => {
  subscribed = new Set();
  appliedSeq = new Map();
  if (repositories.length > 0) void subscribeRepos(repositories.map((r) => r.repo_id));
};

// ── React binding ───────────────────────────────────────────────────────────

export const getScmSnapshot = (): ScmView => snapshot;

export const subscribeScm = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Subscribe a React component to the SCM view. */
export const useScm = (): ScmView => useSyncExternalStore(subscribeScm, getScmSnapshot, getScmSnapshot);

/** Test hook: read the declared subscription set + seq high-water marks. */
export const getScmInternalsForTest = (): { subscribed: string[]; appliedSeq: Record<string, number> } => ({
  subscribed: [...subscribed],
  appliedSeq: Object.fromEntries(appliedSeq),
});

/** Test hook: reset all module state. */
export const resetScmStoreForTest = (): void => {
  port = null;
  projectId = null;
  repositories = [];
  statuses = new Map();
  appliedSeq = new Map();
  subscribed = new Set();
  loadState = 'idle';
  error = undefined;
  selectedRepoId = null;
  selectedResource = null;
  actionBusy = false;
  actionReport = null;
  lastAction = null;
  snapshot = EMPTY_VIEW;
  listeners.clear();
};
