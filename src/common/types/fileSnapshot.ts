/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type FileChangeOperation = 'create' | 'modify' | 'delete';

export type FileChangeEvent = {
  workspace: string;
  filePath: string;
  relativePath: string;
  operation: FileChangeOperation;
  before: string | null;
  after: string | null;
  timestamp: number;
};

export type FileChangeRecord = {
  filePath: string;
  relativePath: string;
  operation: FileChangeOperation;
  before: string | null;
  after: string | null;
  timestamp: number;
};

/**
 * Merge a new FileChangeEvent into an existing FileChangeRecord.
 * Returns the updated record, or null if the net effect is "nothing happened"
 * (e.g. a file was created then deleted).
 */
export function mergeFileChange(
  existing: FileChangeRecord | undefined,
  event: FileChangeEvent
): FileChangeRecord | null {
  if (!existing) {
    return {
      filePath: event.filePath,
      relativePath: event.relativePath,
      operation: event.operation,
      before: event.before,
      after: event.after,
      timestamp: event.timestamp,
    };
  }

  const { operation: prev } = existing;
  const { operation: next } = event;

  // create + modify → still a create, but with updated content
  if (prev === 'create' && next === 'modify') {
    return {
      ...existing,
      after: event.after,
      timestamp: event.timestamp,
    };
  }

  // create + delete → net effect is nothing
  if (prev === 'create' && next === 'delete') {
    return null;
  }

  // modify + modify → keep original before, update after
  if (prev === 'modify' && next === 'modify') {
    return {
      ...existing,
      after: event.after,
      timestamp: event.timestamp,
    };
  }

  // modify + delete → delete with original before
  if (prev === 'modify' && next === 'delete') {
    return {
      ...existing,
      operation: 'delete',
      after: null,
      timestamp: event.timestamp,
    };
  }

  // delete + create → modify (before = original before delete, after = new content)
  if (prev === 'delete' && next === 'create') {
    return {
      ...existing,
      operation: 'modify',
      after: event.after,
      timestamp: event.timestamp,
    };
  }

  // Fallback: replace with event data (shouldn't happen with valid sequences)
  return {
    filePath: event.filePath,
    relativePath: event.relativePath,
    operation: event.operation,
    before: event.before,
    after: event.after,
    timestamp: event.timestamp,
  };
}
