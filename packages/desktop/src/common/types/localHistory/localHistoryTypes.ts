/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for the desktop-side Local History integration — a VS
 * Code-style "Timeline" source that works WITHOUT git.
 *
 * The store is owned exclusively by the Electron main process
 * (`LocalHistoryService`, persisting content-addressed snapshots under
 * `userData/local-history/`). The renderer never touches that store
 * directly; it drives everything through the `localHistory.*` IPC
 * namespace in `ipcBridge`.
 *
 * Semantics note (important): a snapshot captures the PRIOR on-disk state
 * of a file — the content that existed before a write replaced it (plus a
 * baseline snapshot the first time a file is opened). Restoring an entry
 * therefore returns the file to the state it was in when that entry was
 * created. The renderer is responsible for the actual write-back (the main
 * process has no filesystem access to user workspaces).
 *
 * Naming note: request payloads use snake_case (consistent with the rest
 * of the bridge), domain objects use camelCase.
 */

/** What triggered a snapshot. Surfaced in the Timeline so the user can tell
 * a manual save apart from an agent edit or a restore checkpoint. */
export type LocalHistorySource = 'open' | 'save' | 'agent' | 'autosave' | 'restore';

/** A single restorable snapshot of a file's content. */
export type LocalHistoryEntry = {
  /** Stable per-entry id (timestamp + short random suffix). */
  id: string;
  /** Epoch milliseconds when the snapshot was taken. */
  timestamp: number;
  /** sha256 of the snapshot content (also the on-disk blob filename). */
  contentHash: string;
  /** Byte length of the snapshot content (UTF-8). */
  size: number;
  /** What produced this snapshot. */
  source: LocalHistorySource;
};

// --- IPC request payloads --------------------------------------------------

/**
 * Add a snapshot for `file_path` capturing `content` (the PRIOR state being
 * replaced, or the baseline on first open). De-duplicated against the most
 * recent entry: if `content` is identical to the newest entry's content, no
 * new entry is created (returns the existing entry).
 */
export type LocalHistoryAddRequest = {
  /** Absolute path of the file the snapshot belongs to. */
  file_path: string;
  /** The content to snapshot. */
  content: string;
  /** What triggered the snapshot. */
  source: LocalHistorySource;
};

/** List all snapshots for a file, newest-first. */
export type LocalHistoryListRequest = {
  file_path: string;
};

/** Fetch the full content of a single snapshot. */
export type LocalHistoryContentRequest = {
  file_path: string;
  /** {@link LocalHistoryEntry.id}. */
  entry_id: string;
};

/** Delete a single snapshot (GCs its blob when no other entry references it). */
export type LocalHistoryDeleteRequest = {
  file_path: string;
  entry_id: string;
};

/** Delete the entire history for a file. */
export type LocalHistoryClearRequest = {
  file_path: string;
};

// --- IPC results -----------------------------------------------------------

/** Result of {@link LocalHistoryAddRequest}. `created` is false when the add
 * was de-duplicated against the newest existing entry. */
export type LocalHistoryAddResult = {
  entry: LocalHistoryEntry;
  created: boolean;
};

/** Result of {@link LocalHistoryContentRequest}. `content` is null when the
 * entry (or its blob) no longer exists. */
export type LocalHistoryContentResult = {
  content: string | null;
};
