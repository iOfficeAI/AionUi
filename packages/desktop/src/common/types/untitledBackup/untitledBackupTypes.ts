/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for the desktop-side Untitled Backup integration — VS
 * Code-style transparent hot-exit backups for untitled (unsaved) files.
 *
 * The store is owned exclusively by the Electron main process
 * (`UntitledBackupService`, persisting per-backup `<id>.content` and
 * `<id>.meta.json` files under `userData/untitled-backups/`). The
 * renderer never touches that store directly; it drives everything
 * through the `untitledBackup.*` IPC namespace in `ipcBridge`.
 *
 * The hot-exit lifecycle (mirrors VS Code):
 *   1. Renderer opens an untitled editor → `write({ backupId, content, meta })`
 *      once, with a freshly-minted stable `backupId` for that tab.
 *   2. Each subsequent keystroke / save → `write(...)` again (idempotent
 *      overwrite of the same `<backupId>` pair of files).
 *   3. User saves to a real file path → `delete({ backupId })` to discard
 *      the backup (the content is now durably persisted by the workspace).
 *   4. App restart / crash → renderer calls `list()` to discover backups
 *      that still have no on-disk file, then `read({ backupId })` to
 *      rehydrate the editor.
 *
 * Naming note: request payloads use snake_case for `backupId` and the
 * meta fields (`fileName`, `language`), consistent with the rest of
 * the bridge.
 */

/** Persisted meta for a single backup. `timestamp` is set by the service
 * on every write. */
export type UntitledBackupMeta = {
  backupId: string;
  fileName: string;
  language: string;
  timestamp: number;
};

// --- IPC request payloads --------------------------------------------------

/** Persist (or overwrite) a backup for `backupId`. */
export type UntitledBackupWriteRequest = {
  backupId: string;
  content: string;
  meta: Omit<UntitledBackupMeta, 'timestamp'>;
};

/** Fetch the persisted content + meta for a single backup. */
export type UntitledBackupReadRequest = {
  backupId: string;
};

/** Remove a single backup (both content and meta files). */
export type UntitledBackupDeleteRequest = {
  backupId: string;
};

// --- IPC results -----------------------------------------------------------

/** Returned by `read`. `null` when no backup exists for `backupId`. */
export type UntitledBackupReadResult = {
  content: string;
  meta: UntitledBackupMeta;
};
