/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for the desktop-side Git integration.
 *
 * Git logic is owned exclusively by the Electron main process (`GitService`,
 * backed by `simple-git` driving the system `git` binary — the same model VS
 * Code uses). The renderer never touches the filesystem or git directly; it
 * drives everything through the `git.*` IPC namespace in `ipcBridge`.
 *
 * Naming note: fields use snake_case for IPC request payloads (consistent with
 * the rest of the bridge), and camelCase for richer domain objects.
 */

/** How git classifies a single path's working-tree change. */
export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

/** A single file's change, relative to the repo root. */
export type GitFileChange = {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the repo root (POSIX separators). */
  relativePath: string;
  status: GitFileStatus;
  /** Original relative path when {@link status} is `'renamed'`. */
  origPath?: string;
  additions?: number;
  deletions?: number;
  /** True when git classifies the blob as binary (diff is not rendered). */
  binary?: boolean;
};

/**
 * Repo discovery result. `isRepo` is decided via `git rev-parse
 * --show-toplevel` so that opening a SUBDIRECTORY of a repo correctly resolves
 * the enclosing repo (the bug that broke the previous implementation).
 */
export type GitRepoInfo = {
  /** True when an enclosing `.git` was discovered. */
  isRepo: boolean;
  /** Absolute repo root (toplevel), or null when not a repo. */
  root: string | null;
  /** Current branch name, or null (detached HEAD / no commits / not a repo). */
  branch: string | null;
  /** False when the `git` binary is missing or not runnable on this machine. */
  gitAvailable: boolean;
};

/**
 * Full working-tree status. A file may appear in BOTH `staged` and `unstaged`
 * when it is partially staged (VS Code shows it in both groups).
 */
export type GitStatus = {
  info: GitRepoInfo;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  conflicted: GitFileChange[];
};

/** Unified-diff text for a single file, ready to hand to diff2html/Monaco. */
export type GitDiffResult = {
  /** Unified diff patch as produced by git. Empty string when there is no diff. */
  patch: string;
  binary: boolean;
};

export type GitInitResult = {
  /** Absolute root of the newly initialized repo. */
  root: string;
  /** True when init created a default `.gitignore` (only when none existed). */
  createdGitignore: boolean;
};

export type GitCommitResult = {
  /** Short SHA of the new commit. */
  commit: string;
  /** Number of files included in the commit. */
  committed: number;
};

/**
 * A single commit that touched a given file, for the VS Code-style Timeline
 * view. Ordered newest-first as returned by `git log <file>`.
 */
export type GitFileLogEntry = {
  /** Full commit SHA. */
  hash: string;
  /** Abbreviated SHA (first 7 chars) for compact display. */
  shortHash: string;
  /** Commit subject line. */
  subject: string;
  /** Author name. */
  author: string;
  /** Author date as an ISO-8601 string. */
  date: string;
};

// --- IPC request payloads -------------------------------------------------

export type GitWorkspaceRequest = { workspace: string };

export type GitFilePathRequest = {
  workspace: string;
  /** Repo-relative or absolute path of the target file. */
  file_path: string;
};

export type GitDiffRequest = {
  workspace: string;
  file_path: string;
  /**
   * When true, diff the STAGED side (index vs HEAD). When false/omitted, diff
   * the unstaged working-tree change (worktree vs index).
   */
  staged?: boolean;
};

export type GitCommitRequest = {
  workspace: string;
  message: string;
};

/**
 * Request the commit history for a single file (VS Code-style Timeline).
 * `max_count` caps the traversal so large histories stay responsive.
 */
export type GitFileLogRequest = {
  workspace: string;
  /** Repo-relative or absolute path of the target file. */
  file_path: string;
  /** Maximum number of commits to return (default 50). */
  max_count?: number;
};

// --- IPC events -----------------------------------------------------------

/**
 * Emitted (debounced) by the main-process file watcher when the working tree of
 * a watched workspace changes, so the renderer can refresh its status. Decouples
 * the panel from aioncore's WS stream entirely.
 */
export type GitChangedEvent = {
  /** The workspace argument that registered the watch. */
  workspace: string;
  /**
   * Resolved repo root whose working tree changed. The renderer matches on
   * this (not the raw workspace) so a workspace that is a SUBDIRECTORY of a
   * repo still refreshes when sibling files elsewhere in the repo change.
   */
  root: string;
};
