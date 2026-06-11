/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module-level upload state store with React hook via useSyncExternalStore.
 * No Context Provider needed — any component can subscribe by calling useUploadState().
 *
 * Tracks active file uploads (count + per-file progress) so the UI can:
 * - disable the send button while uploads are in flight
 * - show an aggregated progress indicator
 * - render a per-file list with a cancel/abort affordance
 * - bulk-abort uploads when the active conversation switches or unmounts
 */

import { useSyncExternalStore } from 'react';

export type UploadSource = 'sendbox' | 'workspace';

interface UploadStateSnapshot {
  /** Number of files currently being uploaded */
  activeCount: number;
  /** true when at least one upload is in progress */
  isUploading: boolean;
  /** Weighted average progress across all active uploads (0-100), 0 when idle */
  overallPercent: number;
}

/** Public, read-only view of a single in-flight upload (rendered by the UI). */
export interface ActiveUpload {
  id: number;
  name: string;
  size: number;
  percent: number;
  source: UploadSource;
  conversationId?: string;
}

interface UploadEntry {
  percent: number;
  size: number;
  source: UploadSource;
  name: string;
  conversationId?: string;
  /** Per-upload aborter — fires when user clicks cancel or conversation switches. */
  abort: () => void;
}

// ── Internal store ─────────────────────────────────────────────────────────

let nextId = 0;
const uploads = new Map<number, UploadEntry>();
const listeners = new Set<() => void>();

let globalSnapshot: UploadStateSnapshot = { activeCount: 0, isUploading: false, overallPercent: 0 };
const sourceSnapshots: Record<UploadSource, UploadStateSnapshot> = {
  sendbox: { activeCount: 0, isUploading: false, overallPercent: 0 },
  workspace: { activeCount: 0, isUploading: false, overallPercent: 0 },
};

// Cached active-upload list snapshots so useSyncExternalStore receives a stable
// reference between notifications when nothing changed.
let activeListGlobal: ActiveUpload[] = [];
let activeListBySource: Record<UploadSource, ActiveUpload[]> = {
  sendbox: [],
  workspace: [],
};

function calcSnapshot(filter?: UploadSource): UploadStateSnapshot {
  let totalBytes = 0;
  let loadedBytes = 0;
  let count = 0;
  for (const u of uploads.values()) {
    if (filter && u.source !== filter) continue;
    count++;
    totalBytes += u.size;
    loadedBytes += u.size * (u.percent / 100);
  }
  if (count === 0) return { activeCount: 0, isUploading: false, overallPercent: 0 };
  return {
    activeCount: count,
    isUploading: true,
    overallPercent: totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0,
  };
}

function buildList(filter?: UploadSource): ActiveUpload[] {
  const list: ActiveUpload[] = [];
  for (const [id, u] of uploads.entries()) {
    if (filter && u.source !== filter) continue;
    list.push({
      id,
      name: u.name,
      size: u.size,
      percent: u.percent,
      source: u.source,
      conversationId: u.conversationId,
    });
  }
  return list;
}

function recalcSnapshot(): void {
  globalSnapshot = calcSnapshot();
  sourceSnapshots.sendbox = calcSnapshot('sendbox');
  sourceSnapshots.workspace = calcSnapshot('workspace');
  activeListGlobal = buildList();
  activeListBySource = {
    sendbox: buildList('sendbox'),
    workspace: buildList('workspace'),
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Public API for upload callers ──────────────────────────────────────────

export interface TrackUploadOptions {
  source?: UploadSource;
  /** Display name shown in the UI per-file row. Defaults to "Uploading file". */
  name?: string;
  /** Bind the upload to a conversation; used by abortUploads({ conversationId }). */
  conversationId?: string;
  /** Called when the upload is aborted via abortUpload(id) / abortUploads(...). */
  onAbort?: () => void;
}

/**
 * Register a new upload. Returns an object with:
 * - `id`: opaque handle (also used to cancel via abortUpload)
 * - `onProgress(percent)`: call from XHR progress handler
 * - `finish()`: call when upload completes (success, error, or abort)
 * - `abort()`: convenience for cancelling this specific upload
 */
export function trackUpload(
  fileSize: number,
  sourceOrOptions: UploadSource | TrackUploadOptions = 'sendbox'
): {
  id: number;
  onProgress: (percent: number) => void;
  finish: () => void;
  abort: () => void;
} {
  const opts: TrackUploadOptions = typeof sourceOrOptions === 'string' ? { source: sourceOrOptions } : sourceOrOptions;
  const source = opts.source ?? 'sendbox';
  const id = nextId++;
  let aborted = false;
  const abort = (): void => {
    if (aborted) return;
    aborted = true;
    try {
      opts.onAbort?.();
    } catch (err) {
      console.warn('[useUploadState] onAbort threw:', err);
    }
  };
  uploads.set(id, {
    percent: 0,
    size: fileSize,
    source,
    name: opts.name ?? 'Uploading file',
    conversationId: opts.conversationId,
    abort,
  });
  recalcSnapshot();
  notify();

  return {
    id,
    onProgress(percent: number) {
      const entry = uploads.get(id);
      if (entry) {
        entry.percent = percent;
        recalcSnapshot();
        notify();
      }
    },
    finish() {
      uploads.delete(id);
      recalcSnapshot();
      notify();
    },
    abort,
  };
}

/** Cancel a single upload by id. Safe to call after the upload has completed. */
export function abortUpload(id: number): void {
  const entry = uploads.get(id);
  if (!entry) return;
  entry.abort();
}

export interface AbortUploadsFilter {
  source?: UploadSource;
  /** Only abort uploads whose conversationId matches (use null for the unbound bucket). */
  conversationId?: string | null;
  /** Only abort uploads whose conversationId does NOT match the given value. */
  exceptConversationId?: string | null;
}

/**
 * Bulk-cancel uploads matching the filter.
 *
 * - No filter: aborts everything.
 * - `source`: scope to a particular UI surface (sendbox / workspace).
 * - `conversationId` / `exceptConversationId`: scope to (or exclude) a conversation.
 *
 * Useful when the active conversation changes — call
 * `abortUploads({ source: 'sendbox', exceptConversationId: nextConversationId })`
 * to halt anything still uploading for the previous conversation.
 */
export function abortUploads(filter: AbortUploadsFilter = {}): void {
  // Snapshot first because abort() will eventually call finish() and mutate the map.
  const targets: UploadEntry[] = [];
  for (const entry of uploads.values()) {
    if (filter.source && entry.source !== filter.source) continue;
    if (filter.conversationId !== undefined && entry.conversationId !== (filter.conversationId ?? undefined)) {
      continue;
    }
    if (
      filter.exceptConversationId !== undefined &&
      entry.conversationId === (filter.exceptConversationId ?? undefined)
    ) {
      continue;
    }
    targets.push(entry);
  }
  for (const entry of targets) {
    entry.abort();
  }
}

// ── Stable snapshot getters (module-level to avoid per-render closure churn) ─

const getGlobalSnapshot = (): UploadStateSnapshot => globalSnapshot;
const sourceSnapshotGetters: Record<UploadSource, () => UploadStateSnapshot> = {
  sendbox: () => sourceSnapshots.sendbox,
  workspace: () => sourceSnapshots.workspace,
};

const getGlobalList = (): ActiveUpload[] => activeListGlobal;
const listGettersBySource: Record<UploadSource, () => ActiveUpload[]> = {
  sendbox: () => activeListBySource.sendbox,
  workspace: () => activeListBySource.workspace,
};

// ── React hooks ────────────────────────────────────────────────────────────

/**
 * Subscribe to upload state. Pass a source to scope to that area only;
 * omit for global state.
 */
export function useUploadState(source?: UploadSource): UploadStateSnapshot {
  const getSnapshot = source ? sourceSnapshotGetters[source] : getGlobalSnapshot;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribe to the list of in-flight uploads (with name + percent + id) so the
 * UI can render a per-file row with a cancel button. Pass a source to scope.
 */
export function useActiveUploads(source?: UploadSource): ActiveUpload[] {
  const getList = source ? listGettersBySource[source] : getGlobalList;
  return useSyncExternalStore(subscribe, getList, getList);
}
