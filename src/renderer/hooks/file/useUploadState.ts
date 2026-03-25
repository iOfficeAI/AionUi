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
 */

import { useSyncExternalStore } from 'react';

interface UploadStateSnapshot {
  /** Number of files currently being uploaded */
  activeCount: number;
  /** true when at least one upload is in progress */
  isUploading: boolean;
  /** Weighted average progress across all active uploads (0-100), 0 when idle */
  overallPercent: number;
}

// ── Internal store ─────────────────────────────────────────────────────────

let nextId = 0;
const uploads = new Map<number, { percent: number; size: number }>();
const listeners = new Set<() => void>();

function getSnapshot(): UploadStateSnapshot {
  return currentSnapshot;
}

let currentSnapshot: UploadStateSnapshot = { activeCount: 0, isUploading: false, overallPercent: 0 };

function recalcSnapshot(): void {
  if (uploads.size === 0) {
    currentSnapshot = { activeCount: 0, isUploading: false, overallPercent: 0 };
  } else {
    let totalBytes = 0;
    let loadedBytes = 0;
    for (const u of uploads.values()) {
      totalBytes += u.size;
      loadedBytes += u.size * (u.percent / 100);
    }
    currentSnapshot = {
      activeCount: uploads.size,
      isUploading: true,
      overallPercent: totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0,
    };
  }
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

/**
 * Register a new upload. Returns an object with:
 * - `id`: opaque handle
 * - `onProgress(percent)`: call from XHR progress handler
 * - `finish()`: call when upload completes (success or error)
 */
export function trackUpload(fileSize: number): {
  id: number;
  onProgress: (percent: number) => void;
  finish: () => void;
} {
  const id = nextId++;
  uploads.set(id, { percent: 0, size: fileSize });
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
  };
}

// ── React hook ─────────────────────────────────────────────────────────────

export function useUploadState(): UploadStateSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
