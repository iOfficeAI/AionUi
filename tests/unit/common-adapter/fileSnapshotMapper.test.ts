/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for the snake_case → camelCase mapping that translates
 * backend `/api/fs/snapshot/compare` responses to the frontend FileChangeInfo
 * shape. Without this mapping, `change.relativePath` is undefined and downstream
 * calls to `/api/fs/snapshot/baseline` fail with HTTP 400 "missing field
 * `file_path`".
 */

import { describe, it, expect } from 'vitest';
import { fromBackendCompareResult, type RawCompareResult } from '@/common/adapter/fileSnapshotMapper';

describe('fileSnapshotMapper', () => {
  it('maps relative_path → relativePath while preserving file_path and operation', () => {
    const raw: RawCompareResult = {
      staged: [{ file_path: '/ws/a.txt', relative_path: 'a.txt', operation: 'modify' }],
      unstaged: [
        { file_path: '/ws/sub/b.md', relative_path: 'sub/b.md', operation: 'create' },
        { file_path: '/ws/c.bin', relative_path: 'c.bin', operation: 'delete' },
      ],
    };

    const result = fromBackendCompareResult(raw);

    expect(result).toEqual({
      staged: [{ file_path: '/ws/a.txt', relativePath: 'a.txt', operation: 'modify' }],
      unstaged: [
        { file_path: '/ws/sub/b.md', relativePath: 'sub/b.md', operation: 'create' },
        { file_path: '/ws/c.bin', relativePath: 'c.bin', operation: 'delete' },
      ],
    });
  });

  it('returns empty arrays when staged/unstaged are missing', () => {
    expect(fromBackendCompareResult({} as RawCompareResult)).toEqual({
      staged: [],
      unstaged: [],
    });
  });

  it('does not leak the snake_case relative_path field', () => {
    const raw: RawCompareResult = {
      staged: [{ file_path: '/ws/a.txt', relative_path: 'a.txt', operation: 'modify' }],
      unstaged: [],
    };

    const [first] = fromBackendCompareResult(raw).staged;
    expect(first).toBeDefined();
    expect((first as Record<string, unknown>).relative_path).toBeUndefined();
    expect(first?.relativePath).toBe('a.txt');
  });
});
