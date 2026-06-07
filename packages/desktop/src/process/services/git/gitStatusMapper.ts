/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure mappers from `simple-git`'s `StatusResult` to the desktop's
 * `GitStatus` / `GitFileChange` shape used by the renderer.
 *
 * The mapping rules are intentionally documented here so the contract between
 * main and renderer is obvious. NO IO is performed in this file — every helper
 * is a deterministic function of its inputs and is safe to unit-test.
 *
 * Mapping rules (derived from `git status` porcelain codes, see
 * https://git-scm.com/docs/git-status#_short_format):
 *
 *   - State is derived per-file from `status.files[*].index` (the STAGED
 *     / "X" code) and `status.files[*].working_dir` (the UNSTAGED / "Y"
 *     code). The simple-git aggregate arrays (`status.modified`, `status.staged`,
 *     `status.deleted`, `status.created`, `status.not_added`) are NOT consulted
 *     because they conflate staged and unstaged changes (e.g. a file staged for
 *     modification also appears in `status.modified`).
 *
 *   - A STAGED entry exists for a file iff its `index` code is one of
 *     `A, M, D, R, C` (i.e. not ' ' and not '?').
 *
 *   - An UNSTAGED entry exists for a file iff its `working_dir` code is one
 *     of `M, D, A, R, C, U` (i.e. not ' ' and not '?'). The "??" pair is
 *     treated as `untracked` and is placed in the unstaged bucket (not
 *     staged), matching how editors surface untracked files in the working
 *     tree.
 *
 *   - A partially-staged file (e.g. AM, RM, MD) has BOTH a staged and an
 *     unstaged entry. A staged-only file (e.g. `M `) appears in staged
 *     only. A working-only file (e.g. ` M`) appears in unstaged only.
 *
 *   - Code → status:
 *       M → modified
 *       D → deleted
 *       A → added
 *       R → renamed (origPath = `from` → `to`)
 *       C → added (copy-detection; we collapse to "added")
 *       U, AA, DD, AU, UA, UD, DU, UU → conflicted (placed in the
 *         `conflicted` bucket, NOT duplicated into staged/unstaged)
 *       ?? → untracked (unstaged bucket)
 *
 *   - `relativePath` is always POSIX; `path` is always absolute.
 */

import type { FileStatusResult, StatusResult } from 'simple-git';
import type { GitFileChange, GitFileStatus, GitStatus } from '@/common/types/git/gitTypes';
import { joinAbs, toPosix } from './pathUtils';

/**
 * Best-effort per-file metadata (additions / deletions / binary) keyed by
 * relative path. Built once from `git diff --numstat` (or `--cached
 * --numstat`) and consumed by {@link mapStatus} when populating
 * `GitFileChange.additions` / `.deletions` / `.binary`.
 *
 * Values are deliberately loose (`number | null`) so the mapper degrades
 * gracefully when numstat returns `-` for binary files.
 */
export type NumStatMap = Map<string, { additions: number; deletions: number; binary: boolean }>;

/**
 * Build a {@link NumStatMap} from the raw output of `git diff --numstat` (or
 * `--cached --numstat`). The format is `<additions>\t<deletions>\t<path>`,
 * with binary files reporting `-` for both counts and a `Binary files …`
 * marker (which we treat as `binary:true`).
 *
 * The parser is a PURE function — the caller is responsible for executing
 * `git` and providing the stdout. That keeps the mapper testable.
 */
export function parseNumStat(stdout: string): NumStatMap {
  const out: NumStatMap = new Map();
  if (!stdout) return out;
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    // Binary markers (e.g. "Binary files a/foo and b/foo differ") have no
    // tab-separated counts; treat the entire line as a single path.
    if (line.startsWith('Binary files ')) {
      const match = line.match(/ and b\/(.+?) differ/);
      const filePath = match?.[1] ?? line;
      out.set(toPosix(filePath), { additions: 0, deletions: 0, binary: true });
      continue;
    }
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [addRaw, delRaw, ...pathParts] = parts;
    const relPath = toPosix(pathParts.join('\t'));
    const binary = addRaw === '-' || delRaw === '-';
    const additions = binary ? 0 : Number.parseInt(addRaw, 10) || 0;
    const deletions = binary ? 0 : Number.parseInt(delRaw, 10) || 0;
    out.set(relPath, { additions, deletions, binary });
  }
  return out;
}

/**
 * Merge an optional numstat map into a `GitFileChange` so the consumer gets
 * richer data when available without paying for it otherwise.
 */
function withNumStat(change: GitFileChange, stats: NumStatMap): GitFileChange {
  const entry = stats.get(change.relativePath);
  if (!entry) return change;
  if (entry.binary) {
    return { ...change, binary: true };
  }
  return {
    ...change,
    additions: entry.additions,
    deletions: entry.deletions,
  };
}

/** Set of porcelain codes that indicate a real staged change. */
const STAGED_CODES = new Set(['A', 'M', 'D', 'R', 'C']);

/** Set of porcelain codes that indicate a real unstaged change. */
const UNSTAGED_CODES = new Set(['M', 'D', 'A', 'R', 'C', 'U']);

/** Set of conflict codes (unmerged entries). */
const CONFLICT_CODES = new Set(['U', 'AA', 'DD', 'AU', 'UA', 'UD', 'DU', 'UU']);

/**
 * Map a single porcelain code character to a `GitFileStatus`. Returns
 * `null` for codes we deliberately ignore (whitespace, `?` untracked
 * indicator, `!` ignored).
 */
function porcelainToGitFileStatus(code: string): GitFileStatus | null {
  switch (code) {
    case 'A':
    case 'C':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case '?':
      return 'untracked';
    case 'U':
      return 'conflicted';
    default:
      return null;
  }
}

/**
 * Decide whether the given `index` + `working_dir` code pair represents a
 * merge conflict. Git reports unmerged paths with two non-whitespace codes
 * (one per side of the merge) — the simple cases (`UU`, `AA`, `DD`, `AU`,
 * `UA`, `UD`, `DU`) all surface as conflicted to the user.
 */
function isConflictCodePair(index: string, workingDir: string): boolean {
  const pair = `${index}${workingDir}`;
  if (CONFLICT_CODES.has(pair)) return true;
  if (index === 'U' || workingDir === 'U') return true;
  return false;
}

/**
 * Build a `GitFileChange` for a single path. Computes both the repo-relative
 * (POSIX) and absolute paths. Optional `origPath` is used for renames; the
 * numeric / binary fields are layered on top by {@link withNumStat}.
 */
function makeChange(root: string, relativePath: string, status: GitFileStatus, origPath?: string): GitFileChange {
  const rel = toPosix(relativePath);
  const abs = joinAbs(root, rel);
  const out: GitFileChange = {
    path: abs,
    relativePath: rel,
    status,
  };
  if (origPath) out.origPath = toPosix(origPath);
  return out;
}

/**
 * Empty numstat map — used when callers don't have (or want) numstat.
 */
export const EMPTY_NUMSTAT: NumStatMap = new Map();

/**
 * Map a `StatusResult` to the desktop's `GitStatus` shape. The optional
 * `unstagedStats` and `stagedStats` arguments provide line-count / binary
 * information from `git diff --numstat` and `git diff --cached --numstat`
 * respectively; when omitted, the output has no `additions` / `deletions` /
 * `binary` fields populated.
 *
 * The mapping is deterministic and IO-free — `StatusResult` is treated as
 * data, not as a side-effecting object.
 *
 * @param status       The simple-git `StatusResult` for the repo.
 * @param root         The resolved repo root (absolute, native separators).
 * @param infoBranch   Optional pre-computed branch string (e.g. from
 *                     `GitService.getRepoInfo`) so the branch field matches
 *                     what `getRepoInfo` would return — including `null`
 *                     for unborn HEAD or detached HEAD. When omitted the
 *                     mapper falls back to `status.current` (which is
 *                     incorrect for unborn repos).
 * @param unstagedStats  Numstat map for unstaged changes (working tree).
 * @param stagedStats    Numstat map for staged changes (index).
 */
export function mapStatus(
  status: StatusResult,
  root: string,
  unstagedStats: NumStatMap = EMPTY_NUMSTAT,
  stagedStats: NumStatMap = EMPTY_NUMSTAT,
  infoBranch?: string | null
): GitStatus {
  const staged: GitFileChange[] = [];
  const unstaged: GitFileChange[] = [];
  const conflicted: GitFileChange[] = [];
  const stagedPaths = new Set<string>();
  const unstagedPaths = new Set<string>();

  // Build entries from porcelain per-file codes (the single source of
  // truth). Each `FileStatusResult` may contribute 0..2 GitFileChange
  // entries: one to `staged` (when `index` is a real staged code) and
  // one to `unstaged` (when `working_dir` is a real unstaged code).
  for (const entry of status.files ?? []) {
    const f = entry as FileStatusResult;
    if (!f.path) continue;
    const indexCode = f.index ?? ' ';
    const wdCode = f.working_dir ?? ' ';

    // Conflict detection takes precedence — we never surface a conflicted
    // path as both staged and unstaged.
    if (isConflictCodePair(indexCode, wdCode)) {
      const rel = toPosix(f.path);
      conflicted.push(makeChange(root, rel, 'conflicted'));
      continue;
    }

    // Staged entry (if `index` reports a real staged change).
    if (STAGED_CODES.has(indexCode)) {
      const statusFromCode = porcelainToGitFileStatus(indexCode);
      if (statusFromCode) {
        const rel = toPosix(f.path);
        const origPath = indexCode === 'R' && f.from ? f.from : undefined;
        const change = withNumStat(makeChange(root, rel, statusFromCode, origPath), stagedStats);
        staged.push(change);
        stagedPaths.add(rel);
      }
    }

    // Unstaged entry (if `working_dir` reports a real change). Skip the
    // `??` untracked pair — that's still `untracked` and lives in the
    // unstaged bucket, but the path is handled here.
    if (UNSTAGED_CODES.has(wdCode)) {
      const statusFromCode = porcelainToGitFileStatus(wdCode);
      if (statusFromCode) {
        const rel = toPosix(f.path);
        const origPath = wdCode === 'R' && f.from ? f.from : undefined;
        const change = withNumStat(makeChange(root, rel, statusFromCode, origPath), unstagedStats);
        unstaged.push(change);
        unstagedPaths.add(rel);
      }
    } else if (indexCode === '?' && wdCode === '?') {
      // `??` is the untracked indicator pair.
      const rel = toPosix(f.path);
      if (!unstagedPaths.has(rel)) {
        const change = withNumStat(makeChange(root, rel, 'untracked'), unstagedStats);
        unstaged.push(change);
        unstagedPaths.add(rel);
      }
    }
  }

  // Backstop: if `status.files` is missing or incomplete (older simple-git
  // builds, custom serializers, etc.), fall back to the aggregate arrays so
  // we never return an empty list when git clearly reports changes. This
  // only kicks in for files NOT already captured above.
  if (!(status.files && status.files.length > 0)) {
    for (const file of status.created ?? []) {
      const rel = toPosix(file);
      if (stagedPaths.has(rel)) continue;
      staged.push(withNumStat(makeChange(root, rel, 'added'), stagedStats));
      stagedPaths.add(rel);
    }
    for (const file of status.staged ?? []) {
      const rel = toPosix(file);
      if (stagedPaths.has(rel)) continue;
      staged.push(withNumStat(makeChange(root, rel, 'modified'), stagedStats));
      stagedPaths.add(rel);
    }
    for (const renamed of status.renamed ?? []) {
      const rel = toPosix(renamed.to);
      if (stagedPaths.has(rel)) continue;
      staged.push(withNumStat(makeChange(root, rel, 'renamed', renamed.from), stagedStats));
      stagedPaths.add(rel);
    }
    for (const file of status.modified ?? []) {
      const rel = toPosix(file);
      if (unstagedPaths.has(rel)) continue;
      unstaged.push(withNumStat(makeChange(root, rel, 'modified'), unstagedStats));
      unstagedPaths.add(rel);
    }
    for (const file of status.deleted ?? []) {
      const rel = toPosix(file);
      if (unstagedPaths.has(rel)) continue;
      unstaged.push(withNumStat(makeChange(root, rel, 'deleted'), unstagedStats));
      unstagedPaths.add(rel);
    }
    for (const file of status.not_added ?? []) {
      const rel = toPosix(file);
      if (unstagedPaths.has(rel)) continue;
      unstaged.push(withNumStat(makeChange(root, rel, 'untracked'), unstagedStats));
      unstagedPaths.add(rel);
    }
  }

  // Conflicts reported in the legacy `status.conflicted` array (which some
  // simple-git versions still populate) but missing from `status.files` get
  // a second pass so we don't drop them.
  for (const file of status.conflicted ?? []) {
    const rel = toPosix(file);
    if (conflicted.some((c) => c.relativePath === rel)) continue;
    conflicted.push(withNumStat(makeChange(root, rel, 'conflicted'), stagedStats));
  }

  // Branch: prefer the caller-supplied branch (so unborn / detached HEAD
  // resolve to null the same way `getRepoInfo` reports them). Fall back to
  // `status.current` for the common case where the caller didn't supply it.
  let branch: string | null;
  if (infoBranch === undefined) {
    branch = status.current && status.current !== 'HEAD' ? status.current : null;
  } else {
    branch = infoBranch;
  }

  return {
    info: {
      isRepo: true,
      root,
      branch,
      gitAvailable: true,
    },
    staged,
    unstaged,
    conflicted,
  };
}
