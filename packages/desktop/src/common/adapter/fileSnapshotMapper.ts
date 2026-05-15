/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CompareResult, FileChangeInfo, FileChangeOperation } from '@/common/types/platform/fileSnapshot';

export type RawFileChange = {
  file_path: string;
  relative_path: string;
  operation: FileChangeOperation;
};

export type RawCompareResult = {
  staged: RawFileChange[];
  unstaged: RawFileChange[];
};

// Backend serializes `relative_path` (snake_case); the frontend type uses
// `relativePath` (camelCase). Without this mapping, downstream code reads
// `change.relativePath` as undefined and POSTs `{ workspace, file_path: undefined }`
// to /api/fs/snapshot/baseline, producing a 400 "missing field `file_path`".
function mapFileChange(c: RawFileChange): FileChangeInfo {
  return {
    file_path: c.file_path,
    relativePath: c.relative_path,
    operation: c.operation,
  };
}

export function fromBackendCompareResult(raw: RawCompareResult): CompareResult {
  return {
    staged: (raw?.staged ?? []).map(mapFileChange),
    unstaged: (raw?.unstaged ?? []).map(mapFileChange),
  };
}
