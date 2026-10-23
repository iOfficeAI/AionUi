/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Metadata store for the Claude Code Filetree view.
 * Handles the 'size' vs 'age' right-column display mode, toggled by the 'Σ' button,
 * and maintains a cache of file sizes and modification timestamps.
 */

import { useSyncExternalStore } from 'react';
import { ipcBridge } from '@/common';
import { projectFileRef } from '@/common/types/chatFile';

export type MetadataMode = 'size' | 'age';

type FileStat = {
  size?: number;
  lastModified?: number;
  loading?: boolean;
};

type QueueItem = {
  pe_id: string;
  relative_path: string;
};

type FileTreeMetadataState = {
  mode: MetadataMode;
  cache: Map<string, FileStat>;
};

const META_MODE_STORAGE_KEY = 'filetree-meta-mode';

let currentMode: MetadataMode = 'size';

try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(META_MODE_STORAGE_KEY);
    if (saved === 'size' || saved === 'age') {
      currentMode = saved;
    }
  }
} catch {
  // localStorage unavailable
}

const statCache = new Map<string, FileStat>();
const inFlightRequests = new Set<string>();
const listeners = new Set<() => void>();

let snapshot: FileTreeMetadataState = {
  mode: currentMode,
  cache: new Map(statCache),
};

const notify = (): void => {
  snapshot = {
    mode: currentMode,
    cache: new Map(statCache),
  };
  listeners.forEach((l) => l());
};

/** Toggle or set metadata mode */
export const toggleMetadataMode = (): void => {
  currentMode = currentMode === 'size' ? 'age' : 'size';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(META_MODE_STORAGE_KEY, currentMode);
    }
  } catch {
    // ignore
  }
  notify();
};

export const setMetadataMode = (mode: MetadataMode): void => {
  if (currentMode === mode) return;
  currentMode = mode;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(META_MODE_STORAGE_KEY, mode);
    }
  } catch {
    // ignore
  }
  notify();
};

/** Format file size matching claude-code-filetree style */
export const formatFileSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
};

/** Format relative age matching claude-code-filetree style (now, 12m, 3h, 5d, Oct 9, 2024) */
export const formatFileAge = (mtimeMs?: number): string => {
  if (!mtimeMs) return '';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - mtimeMs) / 1000));

  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  const date = new Date(mtimeMs);
  const currentYear = new Date().getFullYear();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()] ?? '';
  const day = date.getDate();

  if (date.getFullYear() === currentYear) {
    return `${month} ${day}`;
  }
  return `${date.getFullYear()}`;
};

const queue: QueueItem[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleNotify = (): void => {
  if (notifyTimer !== null) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    notify();
  }, 180);
};

const flushQueue = async (): Promise<void> => {
  batchTimeout = null;
  const items = queue.splice(0, 20);
  if (items.length === 0) return;

  await Promise.all(
    items.map(async (item) => {
      const key = `${item.pe_id}:${item.relative_path}`;
      try {
        const metadata = await ipcBridge.fs.getContentMetadata.invoke({
          file: projectFileRef(item.pe_id, item.relative_path),
        });
        statCache.set(key, {
          size: metadata?.size,
          lastModified: metadata?.lastModified,
          loading: false,
        });
      } catch {
        statCache.set(key, { loading: false });
      } finally {
        inFlightRequests.delete(key);
      }
    })
  );

  scheduleNotify();

  if (queue.length > 0) {
    batchTimeout = setTimeout(flushQueue, 100);
  }
};

/** Request metadata for a file node if not already cached */
export const requestFileMetadata = (peId: string, relativePath: string): void => {
  const key = `${peId}:${relativePath}`;
  if (statCache.has(key) || inFlightRequests.has(key)) return;

  inFlightRequests.add(key);
  queue.push({ pe_id: peId, relative_path: relativePath });

  if (batchTimeout === null) {
    batchTimeout = setTimeout(flushQueue, 60);
  }
};

/** Invalidate cached metadata when a file is modified */
export const invalidateFileMetadata = (peId: string, relativePath: string): void => {
  const key = `${peId}:${relativePath}`;
  statCache.delete(key);
  inFlightRequests.delete(key);
  requestFileMetadata(peId, relativePath);
};

export const subscribeMetadata = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getMetadataSnapshot = (): FileTreeMetadataState => snapshot;

export const useFileTreeMetadata = (): FileTreeMetadataState => {
  return useSyncExternalStore(subscribeMetadata, getMetadataSnapshot, getMetadataSnapshot);
};
