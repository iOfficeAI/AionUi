/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main-process Git service.
 *
 * Wraps `simple-git` (which shells out to the system `git` binary) and owns
 * the lifecycle of:
 *
 *   - Repo discovery (resolving the enclosing repo root for a workspace, even
 *     when the user opens a SUBDIRECTORY of a repo).
 *   - Status / diff / staging operations.
 *   - Commit + branch listing.
 *   - Working-tree file watching (debounced chokidar) that emits `'changed'`
 *     events so the renderer can refresh.
 *
 * The service is fully decoupled from aioncore — every method uses local IO
 * only. Methods that take a `file_path` accept either an absolute path or a
 * repo-relative POSIX path; both are normalized to an absolute path against
 * the resolved root.
 *
 * Errors are surfaced as native `Error` instances with descriptive messages;
 * callers (the bridge layer) wrap them into `IBridgeResponse` shapes.
 */

import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import simpleGit, { type CommitResult, type SimpleGit, type StatusResult } from 'simple-git';

import type {
  GitChangedEvent,
  GitCommitRequest,
  GitCommitResult,
  GitDiffRequest,
  GitDiffResult,
  GitFileLogEntry,
  GitFileLogRequest,
  GitFilePathRequest,
  GitInitResult,
  GitRepoInfo,
  GitStatus,
  GitWorkspaceRequest,
} from '@/common/types/git/gitTypes';
import { DEFAULT_GITIGNORE_CONTENT, GITIGNORE_FILENAME, WATCH_DEBOUNCE_MS, WATCH_IGNORE_PATTERNS } from './constants';
import { mapStatus, parseNumStat, type NumStatMap } from './gitStatusMapper';
import { resolveAgainstRoot, toPosix } from './pathUtils';

/** Strongly-typed event surface emitted by the service. */
export type GitServiceEvents = {
  /** Debounced working-tree change. */
  changed: (event: GitChangedEvent) => void;
};

/** Constructor dependencies (test injection). */
export type GitServiceDeps = {
  /** Override the simple-git factory (test injection). */
  simpleGitFactory?: (cwd: string) => SimpleGit;
  /** Override the chokidar factory (test injection). */
  chokidarFactory?: typeof chokidar.watch;
  /** Override filesystem existence checks (test injection). */
  exists?: (path: string) => boolean;
  /** Override filesystem read (test injection). */
  readFile?: (path: string, encoding: 'utf8') => string;
  /** Override filesystem write (test injection). */
  writeFile?: (path: string, data: string) => void;
  /** Override filesystem unlink (test injection). */
  unlink?: (path: string) => void;
  /** Override the file-watcher debounce window (test injection). */
  watchDebounceMs?: number;
  /** Override the watch ignore patterns (test injection). */
  watchIgnorePatterns?: readonly string[];
};

/**
 * Returns true when the working directory passed to the factory is itself
 * the root of a git working tree (i.e. `git rev-parse --show-toplevel`
 * returns the same path). Pure helper exposed for tests.
 */
export function isSamePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  if (na === nb) return true;
  // Windows is case-insensitive; preserve that.
  return process.platform === 'win32' && na.toLowerCase() === nb.toLowerCase();
}

/**
 * Detect whether a `git`-style error from simple-git / spawn indicates that
 * the `git` binary itself is not installed / runnable on this machine. Used
 * to set `GitRepoInfo.gitAvailable:false` rather than throwing.
 */
function isGitMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === 'ENOENT') return true;
  const message = e.message ?? '';
  return /git.*not found|command not found.*git|cannot find the path.*git/i.test(message);
}

const NO_STAGED_NUMSTAT = '';
const NO_UNSTAGED_NUMSTAT = '';

/**
 * Per-workspace watcher bookkeeping. The watcher itself is keyed by the
 * RESOLVED repo root (so a subdirectory workspace still gets notifications
 * for sibling changes), but we also keep the original workspace argument
 * around so we can echo it back in `'changed'` events.
 */
type WatcherEntry = {
  /** Resolved repo root whose working tree the watcher is observing. */
  root: string;
  /** Active chokidar watcher. */
  watcher: FSWatcher;
  /** Pending debounce timer (cleared on close). */
  timer: NodeJS.Timeout | null;
  /** Workspaces that have called `ensureWatch` against this root (refcount). */
  refs: Set<string>;
};

export class GitService extends EventEmitter {
  private readonly simpleGitFactory: (cwd: string) => SimpleGit;

  private readonly chokidarFactory: typeof chokidar.watch;

  private readonly existsImpl: (path: string) => boolean;

  private readonly readFileImpl: (path: string, encoding: 'utf8') => string;

  private readonly writeFileImpl: (path: string, data: string) => void;

  private readonly unlinkImpl: (path: string) => void;

  private readonly watchDebounceMs: number;

  private readonly watchIgnorePatterns: readonly string[];

  /** Watchers keyed by the resolved repo root (NOT the raw workspace). */
  private readonly watchers = new Map<string, WatcherEntry>();

  /** Per-workspace cache of whether the repo has any commits. */
  private readonly hasCommitsCache = new Map<string, boolean>();

  constructor(deps: GitServiceDeps = {}) {
    super();
    this.simpleGitFactory = deps.simpleGitFactory ?? ((cwd: string) => simpleGit(cwd));
    this.chokidarFactory = deps.chokidarFactory ?? chokidar.watch;
    this.existsImpl = deps.exists ?? existsSync;
    this.readFileImpl = deps.readFile ?? ((p, enc) => readFileSync(p, enc));
    this.writeFileImpl = deps.writeFile ?? ((p, d) => writeFileSync(p, d));
    this.unlinkImpl = deps.unlink ?? ((p) => unlinkSync(p));
    this.watchDebounceMs = deps.watchDebounceMs ?? WATCH_DEBOUNCE_MS;
    this.watchIgnorePatterns = deps.watchIgnorePatterns ?? WATCH_IGNORE_PATTERNS;
  }

  /** Strongly-typed `on` overload. */
  override on<K extends keyof GitServiceEvents>(event: K, listener: GitServiceEvents[K]): this {
    return super.on(event, listener);
  }

  /** Strongly-typed `off` overload. */
  override off<K extends keyof GitServiceEvents>(event: K, listener: GitServiceEvents[K]): this {
    return super.off(event, listener);
  }

  /** Strongly-typed `emit` overload. */
  override emit<K extends keyof GitServiceEvents>(event: K, ...args: Parameters<GitServiceEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  // -------------------------------------------------------------------------
  // Repo discovery
  // -------------------------------------------------------------------------

  /**
   * Discover the enclosing repo root and current branch for a workspace.
   * Always resolves the actual git toplevel (so opening a SUBDIRECTORY of a
   * repo correctly returns the parent repo) — never just `path/.git`.
   *
   * Returns a {@link GitRepoInfo} with `isRepo:false` and `root:null` when
   * the workspace is not inside a git repo, and `gitAvailable:false` when
   * the system `git` binary is missing.
   */
  async getRepoInfo({ workspace }: GitWorkspaceRequest): Promise<GitRepoInfo> {
    if (!workspace) {
      throw new Error('GitService.getRepoInfo: workspace is required');
    }
    const absWorkspace = path.resolve(workspace);

    // Cheap pre-check: if the workspace itself doesn't exist on disk we
    // cannot have an enclosing repo. Don't try to spawn git.
    if (!this.existsImpl(absWorkspace)) {
      return { isRepo: false, root: null, branch: null, gitAvailable: true };
    }

    const git = this.simpleGitFactory(absWorkspace);
    let root: string;
    try {
      root = (await git.revparse(['--show-toplevel'])).trim();
    } catch (err) {
      if (isGitMissing(err)) {
        return { isRepo: false, root: null, branch: null, gitAvailable: false };
      }
      // Any other error means "not a repo" (or transient failure). Treat as
      // not-a-repo but still assume git is available.
      return { isRepo: false, root: null, branch: null, gitAvailable: true };
    }

    if (!root) {
      return { isRepo: false, root: null, branch: null, gitAvailable: true };
    }

    // Resolve branch. Handle detached HEAD and "no commits yet" (the latter
    // fails with `fatal: ambiguous argument 'HEAD' …`).
    let branch: string | null = null;
    try {
      const raw = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
      branch = raw === 'HEAD' ? null : raw || null;
    } catch {
      branch = null;
    }

    return { isRepo: true, root, branch, gitAvailable: true };
  }

  // -------------------------------------------------------------------------
  // Status + diff
  // -------------------------------------------------------------------------

  /**
   * Return the full working-tree status of the workspace, optionally
   * including line counts from `git diff --numstat`. A workspace outside a
   * repo returns an empty status (and a `info` block that reports
   * `isRepo:false`).
   */
  async getStatus({ workspace }: GitWorkspaceRequest): Promise<GitStatus> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      return {
        info: { isRepo: false, root: null, branch: null, gitAvailable: info.gitAvailable },
        staged: [],
        unstaged: [],
        conflicted: [],
      };
    }

    const git = this.simpleGitFactory(info.root);
    const status: StatusResult = await git.status();
    const { unstagedStats, stagedStats } = await this.collectNumStat(git);

    // Reuse the branch we already resolved in `getRepoInfo` so unborn /
    // detached HEAD report the same value here as they do to the renderer
    // when it polls `getRepoInfo` separately.
    return mapStatus(status, info.root, unstagedStats, stagedStats, info.branch);
  }

  /**
   * Build a unified diff for a single file. Untracked files are synthesized
   * as an all-additions patch.
   *
   * Detection of binary: an empty patch with a `Binary files …` marker in
   * the raw diff is mapped to `{ patch:'', binary:true }`.
   */
  async getDiff({ workspace, file_path, staged }: GitDiffRequest): Promise<GitDiffResult> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      throw new Error(`GitService.getDiff: workspace is not a git repo: ${workspace}`);
    }
    const relPosix = this.toRepoPosix(file_path, info.root);

    // Untracked file → synthesize a patch from its working-tree contents.
    const status = await this.getStatus({ workspace: info.root });
    const ownEntry = [...status.unstaged, ...status.staged].find((c) => c.relativePath === relPosix);
    if (ownEntry?.status === 'untracked') {
      return this.synthesizeUntrackedPatch(info.root, relPosix);
    }

    const git = this.simpleGitFactory(info.root);
    const args = staged ? ['--cached', '--', relPosix] : ['--', relPosix];
    const raw = (await git.diff(args)) ?? '';
    if (this.diffIsBinary(raw)) {
      return { patch: '', binary: true };
    }
    return { patch: raw, binary: false };
  }

  /**
   * Return the commit history for a single file (VS Code-style Timeline),
   * newest-first. Path-limited (`git log -- <file>`) so it stays cheap even
   * on large repos, and capped by `max_count` (default 50).
   *
   * Returns an empty array when the workspace is not a repo, the repo has no
   * commits yet, or the file has no history (e.g. untracked).
   *
   * Fields are parsed from a `--pretty` format using ASCII unit/record
   * separators so commit subjects containing arbitrary characters (including
   * newlines and the usual delimiters) parse unambiguously.
   */
  async getFileLog({ workspace, file_path, max_count }: GitFileLogRequest): Promise<GitFileLogEntry[]> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      return [];
    }
    const git = this.simpleGitFactory(info.root);
    const hasCommits = await this.repoHasCommits(git, info.root);
    if (!hasCommits) {
      return [];
    }
    const relPosix = this.toRepoPosix(file_path, info.root);
    const limit = Math.max(1, Math.min(max_count ?? 50, 200));

    // %x1f = unit separator (between fields), %x1e = record separator (between
    // commits). Both are control bytes that cannot appear in commit metadata.
    const FIELD_SEP = '\x1f';
    const RECORD_SEP = '\x1e';
    const format = ['%H', '%h', '%an', '%aI', '%s'].join(FIELD_SEP) + RECORD_SEP;

    let raw = '';
    try {
      raw = (await git.raw(['log', `--max-count=${limit}`, `--pretty=format:${format}`, '--', relPosix])) ?? '';
    } catch {
      // Unknown path / never-tracked file / other log failure → empty timeline.
      return [];
    }

    return raw
      .split(RECORD_SEP)
      .map((record) => record.replace(/^\r?\n/, '').trim())
      .filter((record) => record.length > 0)
      .map((record) => {
        const [hash = '', shortHash = '', author = '', date = '', ...subjectParts] = record.split(FIELD_SEP);
        return {
          hash,
          shortHash,
          author,
          date,
          subject: subjectParts.join(FIELD_SEP),
        } satisfies GitFileLogEntry;
      })
      .filter((entry) => entry.hash.length > 0);
  }

  // -------------------------------------------------------------------------
  // Staging / unstage / discard / commit / branches
  // -------------------------------------------------------------------------

  /**
   * `git add <file>` for a single path.
   */
  async stageFile({ workspace, file_path }: GitFilePathRequest): Promise<void> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      throw new Error(`GitService.stageFile: workspace is not a git repo: ${workspace}`);
    }
    const relPosix = this.toRepoPosix(file_path, info.root);
    const git = this.simpleGitFactory(info.root);
    await git.add(['--', relPosix]);
  }

  /**
   * `git add -A` (stage all changes, including untracked + deletions).
   */
  async stageAll({ workspace }: GitWorkspaceRequest): Promise<void> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      throw new Error(`GitService.stageAll: workspace is not a git repo: ${workspace}`);
    }
    const git = this.simpleGitFactory(info.root);
    await git.add(['-A']);
  }

  /**
   * Unstage a single file. Uses `git restore --staged` (modern) and falls
   * back to `git reset HEAD -- <file>` (legacy) and to `git rm --cached` for
   * a freshly-initialized repo with no commits.
   */
  async unstageFile({ workspace, file_path }: GitFilePathRequest): Promise<void> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      throw new Error(`GitService.unstageFile: workspace is not a git repo: ${workspace}`);
    }
    const relPosix = this.toRepoPosix(file_path, info.root);
    const git = this.simpleGitFactory(info.root);
    const hasCommits = await this.repoHasCommits(git, info.root);
    if (!hasCommits) {
      // No commits yet — `git restore --staged` requires a HEAD. Fall back to
      // `git rm --cached` for files that are already in the index.
      await git.rm(['--cached', '--', relPosix]).catch(() => {
        /* file may not be in the index — that's OK */
      });
      return;
    }
    try {
      await git.raw(['restore', '--staged', '--', relPosix]);
    } catch {
      await git.reset(['HEAD', '--', relPosix]);
    }
  }

  /**
   * Unstage all changes.
   */
  async unstageAll({ workspace }: GitWorkspaceRequest): Promise<void> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      throw new Error(`GitService.unstageAll: workspace is not a git repo: ${workspace}`);
    }
    const git = this.simpleGitFactory(info.root);
    const hasCommits = await this.repoHasCommits(git, info.root);
    if (!hasCommits) {
      // Best-effort: remove every staged file from the index.
      const status = await git.status();
      for (const f of [...status.created, ...status.staged]) {
        await git.rm(['--cached', '--', f]).catch(() => {
          /* ignore */
        });
      }
      return;
    }
    try {
      await git.raw(['restore', '--staged', '.']);
    } catch {
      await git.reset(['HEAD', '--']);
    }
  }

  /**
   * Discard working-tree changes for a file (DESTRUCTIVE — UI must confirm).
   *
   * Matches VS Code's "Discard Changes" semantics:
   *
   *   - Untracked file → delete from disk (unlink).
   *   - Tracked file with a working-tree change → `git restore --worktree
   *     -- <file>` so any staged content is PRESERVED in the index.
   *   - Repo without commits → `git restore` cannot resolve HEAD, so we
   *     fall back to removing the working-tree copy and dropping the
   *     staged entry from the index. This is the only legitimate use of
   *     `git rm --cached` for an unborn repo.
   *   - Staged-only file in a repo with commits → preserve the staged
   *     content. There is no working-tree change to revert (the working
   //     tree already matches the staged version), so we do nothing.
   *     `git rm --cached` would silently destroy staged work and is
   *     NEVER used for this case.
   *   - We NEVER run `git rm --cached` against a normal tracked file in a
   *     repo with commits — doing so would silently destroy the user's
   *     staged work.
   */
  async discardFile({ workspace, file_path }: GitFilePathRequest): Promise<void> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      throw new Error(`GitService.discardFile: workspace is not a git repo: ${workspace}`);
    }
    const relPosix = this.toRepoPosix(file_path, info.root);
    const git = this.simpleGitFactory(info.root);
    const status = await git.status();

    // Use the porcelain per-file codes so the bucket is unambiguous: a
    // staged-only modified file is in the index, NOT in the working tree.
    const ownFile = (status.files ?? []).find((f) => toPosix(f.path) === relPosix);
    const indexCode = ownFile?.index ?? ' ';
    const wdCode = ownFile?.working_dir ?? ' ';

    const isUntracked = indexCode === '?' && wdCode === '?';
    const hasWorkingTreeChange = wdCode !== ' ' && !isUntracked;
    const hasStagedChange = indexCode !== ' ' && indexCode !== '?';
    const hasCommits = await this.repoHasCommits(git, info.root);

    // Case 1: Untracked file → unlink the file from disk. The index is
    // not touched.
    if (isUntracked) {
      const abs = path.resolve(info.root, ...relPosix.split('/'));
      this.unlinkImpl(abs);
      return;
    }

    // Case 2: Unborn repo (no commits). `git restore` cannot resolve
    // HEAD, so we have no staged/HEAD version to fall back to. The only
    // sensible action is to remove the file from the working tree (if it
    // exists) and drop the staged addition from the index.
    if (!hasCommits) {
      const abs = path.resolve(info.root, ...relPosix.split('/'));
      if (this.existsImpl(abs)) this.unlinkImpl(abs);
      if (hasStagedChange) {
        await git.rm(['--cached', '--', relPosix]).catch(() => {
          /* ignore */
        });
      }
      return;
    }

    // Case 3: Tracked file with a working-tree change → `git restore
    // --worktree`. This restores the working tree to the staged version
    // and PRESERVES any staged content. This is the VS Code "Discard
    // Changes" path for partial-stage and working-only files.
    if (hasWorkingTreeChange) {
      try {
        await git.raw(['restore', '--worktree', '--', relPosix]);
      } catch {
        // Fallback for very old git versions without `--worktree`.
        await git.checkout(['--', relPosix]);
      }
      return;
    }

    // Case 4: Staged-only change in a repo with commits. The working
    // tree already matches the staged version — there is nothing to
    // restore. We MUST preserve the staged content (the user picked
    // "Discard Changes" on a file whose only change is in the index;
    // the working tree is already correct). Do nothing.
  }

  /**
   * List local branch names.
   */
  async getBranches({ workspace }: GitWorkspaceRequest): Promise<string[]> {
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      throw new Error(`GitService.getBranches: workspace is not a git repo: ${workspace}`);
    }
    const git = this.simpleGitFactory(info.root);
    const summary = await git.branchLocal();
    return summary.all ?? [];
  }

  /**
   * Commit currently staged changes. Returns the short SHA and the number
   * of files included.
   */
  async commit({ workspace, message }: GitCommitRequest): Promise<GitCommitResult> {
    if (!message || !message.trim()) {
      throw new Error('GitService.commit: commit message is required');
    }
    const info = await this.getRepoInfo({ workspace });
    if (!info.isRepo || !info.root) {
      throw new Error(`GitService.commit: workspace is not a git repo: ${workspace}`);
    }
    const git = this.simpleGitFactory(info.root);
    const result: CommitResult = await git.commit(message);
    const commit = result.commit ?? '';
    const committed = result.summary?.changes ?? 0;
    // A successful commit means HEAD now exists. Flip the cache so
    // subsequent operations (discardFile, unstageFile) take the
    // with-commits branch instead of the unborn-repo fallback.
    this.hasCommitsCache.set(info.root, true);
    return { commit, committed };
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  /**
   * `git init` in the supplied workspace, creating a `.gitignore` from the
   * default template when one doesn't already exist. NEVER auto-commits.
   */
  async init({ workspace }: GitWorkspaceRequest): Promise<GitInitResult> {
    if (!workspace) {
      throw new Error('GitService.init: workspace is required');
    }
    const abs = path.resolve(workspace);
    if (!this.existsImpl(abs)) {
      throw new Error(`GitService.init: workspace does not exist: ${workspace}`);
    }

    const git = this.simpleGitFactory(abs);
    await git.init();

    const gitignorePath = path.join(abs, GITIGNORE_FILENAME);
    let createdGitignore = false;
    if (!this.existsImpl(gitignorePath)) {
      this.writeFileImpl(gitignorePath, DEFAULT_GITIGNORE_CONTENT);
      createdGitignore = true;
    }

    // Invalidate cached state for this root.
    this.hasCommitsCache.delete(abs);

    return { root: abs, createdGitignore };
  }

  // -------------------------------------------------------------------------
  // Watcher
  // -------------------------------------------------------------------------

  /**
   * Start (or reuse) a debounced file watcher for the given workspace.
   *
   * The watcher is keyed by the RESOLVED repo root (so opening a
   * subdirectory of a repo still surfaces sibling-file changes) and
   * refcounted by workspace, so calling `ensureWatch` twice with the same
   * workspace is idempotent. Multiple distinct workspaces inside the
   * same repo share a single chokidar watcher.
   *
   * When the workspace is not inside a git repo (or git is missing), the
   * watcher falls back to watching the raw workspace path so the UI can
   * still respond to changes that would let the user re-initialize.
   */
  async ensureWatch(workspace: string): Promise<void> {
    if (!workspace) return;
    const absWorkspace = path.resolve(workspace);

    // Resolve the repo root; fall back to the raw workspace when we're not
    // inside a repo so we can still notice when a user creates a `.git`.
    let root = absWorkspace;
    try {
      const info = await this.getRepoInfo({ workspace: absWorkspace });
      if (info.isRepo && info.root) root = info.root;
    } catch {
      // Discovery failed — keep the raw workspace so we still react to
      // disk activity.
    }

    const existing = this.watchers.get(root);
    if (existing) {
      existing.refs.add(absWorkspace);
      return;
    }

    const watcher = this.chokidarFactory(root, {
      ignored: [...this.watchIgnorePatterns],
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: this.watchDebounceMs, pollInterval: 100 },
      depth: 99,
    });
    const entry: WatcherEntry = { root, watcher, timer: null, refs: new Set([absWorkspace]) };
    const onChange = (): void => {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        entry.timer = null;
        try {
          this.emit('changed', { workspace: absWorkspace, root: entry.root });
        } catch (err) {
          console.error('[GitService] changed listener threw:', err);
        }
      }, this.watchDebounceMs);
    };
    watcher.on('add', onChange);
    watcher.on('change', onChange);
    watcher.on('unlink', onChange);
    watcher.on('addDir', onChange);
    watcher.on('unlinkDir', onChange);
    watcher.on('error', (err) => {
      console.error('[GitService] watcher error:', err);
    });
    this.watchers.set(root, entry);
  }

  /**
   * Stop the watcher for a single workspace. Decrements the refcount on
   * the resolved repo root and only closes the chokidar watcher when the
   * count reaches 0.
   *
   * Safe to call for workspaces that were never watched, for subdirectory
   * workspaces, and multiple times in a row.
   */
  async unwatch(workspace: string): Promise<void> {
    if (!workspace) return;
    const absWorkspace = path.resolve(workspace);
    // Find the watcher entry that holds a ref to this workspace. We can't
    // key by `absWorkspace` directly because the map is keyed by the
    // resolved repo root.
    let matched: WatcherEntry | null = null;
    for (const entry of this.watchers.values()) {
      if (entry.refs.has(absWorkspace)) {
        matched = entry;
        break;
      }
    }
    if (!matched) return;
    matched.refs.delete(absWorkspace);
    if (matched.refs.size > 0) return;
    if (matched.timer) clearTimeout(matched.timer);
    await matched.watcher.close().catch(() => {
      /* ignore close errors */
    });
    this.watchers.delete(matched.root);
  }

  /**
   * Stop every watcher. Called from the app `before-quit` teardown path.
   */
  async dispose(): Promise<void> {
    const entries = [...this.watchers.values()];
    this.watchers.clear();
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.timer) clearTimeout(entry.timer);
        await entry.watcher.close().catch(() => {
          /* ignore close errors */
        });
      })
    );
    this.hasCommitsCache.clear();
  }

  /** Number of live chokidar watchers. Mostly for tests. */
  get watcherCount(): number {
    return this.watchers.size;
  }

  /** Total number of workspace→watcher references held (for tests). */
  get watcherRefCount(): number {
    let n = 0;
    for (const e of this.watchers.values()) n += e.refs.size;
    return n;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private toRepoPosix(filePath: string, root: string): string {
    if (!filePath) {
      throw new Error('GitService: file_path is required');
    }
    if (path.isAbsolute(filePath)) {
      // Strip the root prefix; the renderer may pass either an absolute or
      // a relative path.
      const rel = path.relative(root, resolveAgainstRoot(root, filePath));
      return toPosix(rel);
    }
    return toPosix(filePath);
  }

  private diffIsBinary(raw: string): boolean {
    if (!raw) return false;
    // The "Binary files … differ" marker appears as one of the trailing
    // lines of a unified diff (preceded by `diff --git` and `index` lines),
    // so the regex must be multiline-aware.
    return /^Binary files .* differ/m.test(raw);
  }

  /**
   * Build a synthetic all-additions patch for an untracked file. Reads the
   * file with `git diff --no-index -- /dev/null <file>` (which exits non-zero
   * on success but still writes the diff to stdout).
   */
  private async synthesizeUntrackedPatch(root: string, relPosix: string): Promise<GitDiffResult> {
    const abs = path.resolve(root, ...relPosix.split('/'));
    let raw = '';
    try {
      const git = this.simpleGitFactory(root);
      raw = (await git.raw(['diff', '--no-index', '--no-color', '--', '/dev/null', abs])) ?? '';
    } catch (err) {
      // `git diff --no-index` exits non-zero on success; treat any output as
      // the patch.
      const message = err instanceof Error ? err.message : String(err);
      raw = this.extractDiffFromError(message);
    }
    if (!raw) {
      // Last-resort fallback: synthesize a minimal patch from raw bytes.
      try {
        const contents = this.readFileImpl(abs, 'utf8');
        return { patch: this.synthesizeRawPatch(relPosix, contents), binary: false };
      } catch {
        return { patch: '', binary: true };
      }
    }
    if (this.diffIsBinary(raw)) {
      return { patch: '', binary: true };
    }
    return { patch: raw, binary: false };
  }

  private extractDiffFromError(message: string): string {
    if (!message) return '';
    // `git diff --no-index` prints the patch to stderr in some versions.
    const idx = message.indexOf('diff --git');
    return idx >= 0 ? message.slice(idx) : '';
  }

  private synthesizeRawPatch(relPosix: string, contents: string): string {
    const lines = contents.split(/\r?\n/);
    const body = lines.map((line) => `+${line}`).join('\n');
    return [
      `diff --git a/${relPosix} b/${relPosix}`,
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      `+++ b/${relPosix}`,
      `@@ -0,0 +1,${lines.length} @@`,
      body,
      '',
    ].join('\n');
  }

  private async collectNumStat(git: SimpleGit): Promise<{ unstagedStats: NumStatMap; stagedStats: NumStatMap }> {
    let unstagedStats: NumStatMap = new Map();
    let stagedStats: NumStatMap = new Map();
    try {
      const unstagedRaw = (await git.diff(['--numstat'])) ?? NO_UNSTAGED_NUMSTAT;
      unstagedStats = parseNumStat(unstagedRaw);
    } catch (err) {
      console.error('[GitService] numstat (unstaged) failed:', err);
    }
    try {
      const stagedRaw = (await git.diff(['--cached', '--numstat'])) ?? NO_STAGED_NUMSTAT;
      stagedStats = parseNumStat(stagedRaw);
    } catch (err) {
      console.error('[GitService] numstat (staged) failed:', err);
    }
    return { unstagedStats, stagedStats };
  }

  private async repoHasCommits(git: SimpleGit, root: string): Promise<boolean> {
    const cached = this.hasCommitsCache.get(root);
    if (cached === true) return true;
    if (cached === false) {
      // Cached "no commits" can be invalidated by a successful commit()
      // (which writes true) or by a new git init (which deletes the
      // entry). Re-probe on every cache miss so we never take the
      // unborn-repo branch after HEAD has been created.
      this.hasCommitsCache.delete(root);
    }
    try {
      await git.raw(['rev-parse', '--verify', 'HEAD']);
      this.hasCommitsCache.set(root, true);
      return true;
    } catch {
      this.hasCommitsCache.set(root, false);
      return false;
    }
  }
}

/** Process-wide singleton used by the bridge layer. */
let singleton: GitService | null = null;

export function getGitService(): GitService {
  if (!singleton) {
    singleton = new GitService();
  }
  return singleton;
}

export function resetGitServiceForTests(): void {
  singleton?.dispose().catch(() => {
    /* ignore */
  });
  singleton = null;
}
