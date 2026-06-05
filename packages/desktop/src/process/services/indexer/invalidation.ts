/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { stat } from 'fs/promises';
import path from 'path';
import { computeFileContentHash } from './contentHash';
import { shouldIgnoreIndexPath, toWorkspaceRelativePath, type IndexIgnoreOptions } from './ignore';
import {
  createIndexJob,
  deleteFile,
  getFile,
  type ChislIndexStore,
} from './repository';

export type FileChangeEvent = {
  relativePath: string;
  absolutePath: string;
  kind: 'change' | 'delete';
};

export type IndexInvalidationOptions = IndexIgnoreOptions & {
  workspaceRoot: string;
};

function deleteJobMetadata(relativePath: string): string {
  return JSON.stringify({ reason: 'file_deleted', path: relativePath });
}

function reindexJobMetadata(relativePath: string, contentHash: string): string {
  return JSON.stringify({ reason: 'content_changed', path: relativePath, content_hash: contentHash });
}

export async function scheduleFileReindexIfChanged(
  store: ChislIndexStore,
  options: IndexInvalidationOptions,
  relativePath: string,
  absolutePath: string
): Promise<boolean> {
  const { workspaceRoot } = options;
  if (shouldIgnoreIndexPath(relativePath, absolutePath, options)) {
    return false;
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return false;
  }
  if (!fileStat.isFile()) {
    return false;
  }

  const contentHash = await computeFileContentHash(absolutePath);
  if (!contentHash) {
    return false;
  }

  const existing = getFile(store, relativePath, workspaceRoot);
  if (existing?.content_hash === contentHash) {
    return false;
  }

  createIndexJob(store, {
    kind: 'file',
    workspace_root: workspaceRoot,
    file_path: relativePath,
    metadata_json: reindexJobMetadata(relativePath, contentHash),
  });
  return true;
}

export function scheduleFileDeleteInvalidation(
  store: ChislIndexStore,
  options: IndexInvalidationOptions,
  relativePath: string,
  absolutePath: string
): boolean {
  const { workspaceRoot } = options;
  if (shouldIgnoreIndexPath(relativePath, absolutePath, options)) {
    return false;
  }

  const existing = getFile(store, relativePath, workspaceRoot);
  if (!existing) {
    return false;
  }

  deleteFile(store, relativePath, workspaceRoot);
  createIndexJob(store, {
    kind: 'file',
    workspace_root: workspaceRoot,
    file_path: relativePath,
    metadata_json: deleteJobMetadata(relativePath),
  });
  return true;
}

export async function processFileChangeEvents(
  store: ChislIndexStore,
  options: IndexInvalidationOptions,
  events: readonly FileChangeEvent[]
): Promise<{ reindexScheduled: number; deleteScheduled: number }> {
  const { workspaceRoot } = options;
  let reindexScheduled = 0;
  let deleteScheduled = 0;

  const seen = new Set<string>();
  for (const event of events) {
    const key = `${event.kind}:${event.relativePath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (event.kind === 'delete') {
      if (scheduleFileDeleteInvalidation(store, options, event.relativePath, event.absolutePath)) {
        deleteScheduled += 1;
      }
      continue;
    }

    const relative =
      toWorkspaceRelativePath(workspaceRoot, event.absolutePath) ?? event.relativePath;
    const absolute = path.resolve(workspaceRoot, relative);
    if (await scheduleFileReindexIfChanged(store, options, relative, absolute)) {
      reindexScheduled += 1;
    }
  }

  return { reindexScheduled, deleteScheduled };
}
