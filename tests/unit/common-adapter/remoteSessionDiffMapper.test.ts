/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromRemoteSessionDiff,
  mapRemoteStatusToOperation,
  resolveSessionDiffPath,
} from '@/common/adapter/remoteSessionDiffMapper';

describe('remoteSessionDiffMapper', () => {
  it('maps remote session diff entries into Workspace Changes shape', () => {
    const result = fromRemoteSessionDiff(
      [
        {
          path: 'src/a.ts',
          status: 'modified',
          additions: 3,
          deletions: 1,
          diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new',
        },
        {
          file: 'README.md',
          status: 'added',
          additions: 10,
          deletions: 0,
        },
      ],
      '/ws/project'
    );

    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([
      {
        file_path: '/ws/project/src/a.ts',
        relativePath: 'src/a.ts',
        operation: 'modify',
        patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new',
        additions: 3,
        deletions: 1,
      },
      {
        file_path: '/ws/project/README.md',
        relativePath: 'README.md',
        operation: 'create',
        patch: undefined,
        additions: 10,
        deletions: 0,
      },
    ]);
  });

  it('preserves absolute paths without workspace prefix', () => {
    const [entry] = fromRemoteSessionDiff(
      [{ path: '/absolute/path/file.ts', status: 'deleted' }],
      '/ws/project'
    ).unstaged;

    expect(entry?.file_path).toBe('/absolute/path/file.ts');
    expect(entry?.relativePath).toBe('/absolute/path/file.ts');
    expect(entry?.operation).toBe('delete');
  });

  it('returns empty arrays for missing entries', () => {
    expect(fromRemoteSessionDiff(null, '/ws')).toEqual({ staged: [], unstaged: [] });
    expect(fromRemoteSessionDiff(undefined, '/ws')).toEqual({ staged: [], unstaged: [] });
  });
});

describe('mapRemoteStatusToOperation', () => {
  it('maps known statuses and defaults to modify', () => {
    expect(mapRemoteStatusToOperation('added')).toBe('create');
    expect(mapRemoteStatusToOperation('modified')).toBe('modify');
    expect(mapRemoteStatusToOperation('deleted')).toBe('delete');
    expect(mapRemoteStatusToOperation()).toBe('modify');
    expect(mapRemoteStatusToOperation('unknown')).toBe('modify');
  });
});

describe('resolveSessionDiffPath', () => {
  it('prefers path over file and falls back to unknown', () => {
    expect(resolveSessionDiffPath({ path: 'a.ts', file: 'b.ts' })).toBe('a.ts');
    expect(resolveSessionDiffPath({ file: 'b.ts' })).toBe('b.ts');
    expect(resolveSessionDiffPath({})).toBe('(unknown)');
  });
});
