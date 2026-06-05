/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CompareResult, FileChangeInfo, FileChangeOperation } from '@/common/types/platform/fileSnapshot';

export type RawSessionDiffEntry = {
  path?: string;
  file?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  diff?: string;
};

const STATUS_TO_OPERATION: Record<string, FileChangeOperation> = {
  added: 'create',
  create: 'create',
  created: 'create',
  a: 'create',
  modified: 'modify',
  modify: 'modify',
  changed: 'modify',
  m: 'modify',
  deleted: 'delete',
  delete: 'delete',
  removed: 'delete',
  d: 'delete',
};

export function mapRemoteStatusToOperation(status?: string): FileChangeOperation {
  if (!status) return 'modify';
  const normalized = status.toLowerCase();
  return STATUS_TO_OPERATION[normalized] ?? 'modify';
}

export function resolveSessionDiffPath(entry: RawSessionDiffEntry): string {
  return entry.path ?? entry.file ?? '(unknown)';
}

export function fromRemoteSessionDiff(
  entries: RawSessionDiffEntry[] | null | undefined,
  workspace: string
): CompareResult {
  const unstaged: FileChangeInfo[] = (entries ?? []).map((entry) => {
    const relativePath = resolveSessionDiffPath(entry);
    const file_path = relativePath.startsWith('/') ? relativePath : `${workspace}/${relativePath}`;
    return {
      file_path,
      relativePath,
      operation: mapRemoteStatusToOperation(entry.status),
      patch: entry.diff,
      additions: typeof entry.additions === 'number' ? entry.additions : undefined,
      deletions: typeof entry.deletions === 'number' ? entry.deletions : undefined,
    };
  });

  return { staged: [], unstaged };
}
