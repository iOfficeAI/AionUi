/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure display-layer grouping for the Repositories section: fold linked worktrees
 * under the primary clone they belong to, VS Code style. No I/O, no React.
 *
 * Contract it consumes (aioncore `scm/types.rs`, frozen by that repo's
 * `wire_test.rs`): each `ScmRepository` may carry
 *
 *  - `is_worktree` — omitted (⇒ `undefined`) when false; true only for a linked
 *    worktree surfaced under one-level workspace discovery;
 *  - `worktree_of` — the primary repository's `repo_id`, present **only when that
 *    primary is also in this project's surfaced set**; omitted otherwise.
 *
 * The two are independent inputs, not one flag: a worktree whose primary is out of
 * view carries `is_worktree: true` with **no** `worktree_of`. Grouping is a pure
 * function of the list, matched by `repo_id` (never by path text) — the id is the
 * only stable key the backend promises.
 *
 * The result is a **display grouping only**. Selection / status / switching keep
 * their per-repo semantics unchanged: a nested worktree row selects that worktree's
 * own `repo_id`, exactly as an outer row does.
 */

import type { ScmRepository } from './scmModel';

/**
 * One entry in the grouped Repositories list.
 *
 *  - `primary` — a normal top-level repo. `worktrees` holds any linked worktrees
 *    that named it via `worktree_of` (empty for an ordinary repo with none). A
 *    non-empty `worktrees` is what the view renders an expand/collapse toggle for.
 *  - `orphanWorktree` — a linked worktree whose primary is **not** in view; it is
 *    surfaced at the outer level, flagged so the view can mark it with a worktree
 *    glyph rather than nest it under a parent that is not present.
 */
export type ScmRepoGroup =
  | { kind: 'primary'; repo: ScmRepository; worktrees: ScmRepository[] }
  | { kind: 'orphanWorktree'; repo: ScmRepository };

/** Display name a repo sorts by — the same string the row renders. */
const repoSortName = (repo: ScmRepository): string => repo.pe_name || repo.label;

/** Case-insensitive, then case-sensitive tie-break, for stable alphabetical order. */
const byName = (a: ScmRepository, b: ScmRepository): number => {
  const an = repoSortName(a);
  const bn = repoSortName(b);
  const ci = an.toLowerCase().localeCompare(bn.toLowerCase());
  return ci !== 0 ? ci : an.localeCompare(bn);
};

/**
 * Group a flat repository list into primaries with their nested worktrees, plus
 * any orphan worktrees at the outer level.
 *
 * Rules, derived straight from the contract:
 *
 *  - a repo is a **worktree child** iff it has a `worktree_of` that resolves to a
 *    repo present in the same list; it nests under that repo. `worktree_of`
 *    pointing at an id **not** in the list is treated as absent (the primary left
 *    the view between frames) — the worktree becomes an orphan, never dropped.
 *  - a repo with `is_worktree: true` and no resolvable `worktree_of` is an
 *    **orphan worktree**, shown at the outer level with its glyph.
 *  - every other repo is a **primary**, even one with `is_worktree` unset that some
 *    worktree points at.
 *
 * Ordering: outer entries alphabetical by display name (primaries and orphan
 * worktrees interleave by name — a single stable outer order); each primary's
 * `worktrees` alphabetical among themselves. Deterministic for a given input.
 */
export const groupRepositories = (repositories: ScmRepository[]): ScmRepoGroup[] => {
  const byId = new Map<string, ScmRepository>();
  for (const repo of repositories) byId.set(repo.repo_id, repo);

  // A worktree "belongs" only when its named primary is actually present.
  const belongsTo = (repo: ScmRepository): string | undefined =>
    repo.worktree_of && byId.has(repo.worktree_of) ? repo.worktree_of : undefined;

  // Bucket children under their resolved primary id.
  const childrenOf = new Map<string, ScmRepository[]>();
  for (const repo of repositories) {
    const parentId = belongsTo(repo);
    if (parentId === undefined) continue;
    const bucket = childrenOf.get(parentId);
    if (bucket) bucket.push(repo);
    else childrenOf.set(parentId, [repo]);
  }

  const groups: ScmRepoGroup[] = [];
  for (const repo of repositories) {
    // A resolved child is rendered under its parent, not at the outer level.
    if (belongsTo(repo) !== undefined) continue;
    if (repo.is_worktree === true) {
      groups.push({ kind: 'orphanWorktree', repo });
      continue;
    }
    const worktrees = (childrenOf.get(repo.repo_id) ?? []).toSorted(byName);
    groups.push({ kind: 'primary', repo, worktrees });
  }

  return groups.toSorted((a, b) => byName(a.repo, b.repo));
};

/** The `repo_id`s of every primary that has at least one nested worktree — the
 *  rows the view can expand/collapse. Order follows the grouped outer order. */
export const expandableRepoIds = (groups: ScmRepoGroup[]): string[] =>
  groups.filter((g) => g.kind === 'primary' && g.worktrees.length > 0).map((g) => g.repo.repo_id);
