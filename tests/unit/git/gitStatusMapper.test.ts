/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the pure git status mapper. No git is spawned — the
 * `StatusResult` is fabricated inline so we can exercise every code path.
 */

import { describe, expect, it } from 'vitest';
import type { FileStatusResult, StatusResult, StatusResultRenamed } from 'simple-git';
import type { GitFileChange } from '@/common/types/git/gitTypes';
import { EMPTY_NUMSTAT, mapStatus, parseNumStat } from '@/process/services/git/gitStatusMapper';

const ROOT = '/repo';

function makeStatus(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    not_added: [],
    conflicted: [],
    created: [],
    deleted: [],
    modified: [],
    renamed: [],
    staged: [],
    files: [],
    ahead: 0,
    behind: 0,
    current: 'main',
    tracking: null,
    detached: false,
    isClean: () => true,
    ...overrides,
  } as StatusResult;
}

describe('parseNumStat', () => {
  it('returns an empty map for empty input', () => {
    expect(parseNumStat('').size).toBe(0);
  });

  it('parses standard text files', () => {
    const out = parseNumStat('3\t1\tsrc/foo.ts\n5\t0\tsrc/bar.ts\n');
    expect(out.size).toBe(2);
    expect(out.get('src/foo.ts')).toEqual({ additions: 3, deletions: 1, binary: false });
    expect(out.get('src/bar.ts')).toEqual({ additions: 5, deletions: 0, binary: false });
  });

  it('flags binary files', () => {
    const out = parseNumStat('-\t-\tassets/logo.png\n');
    expect(out.get('assets/logo.png')).toEqual({ additions: 0, deletions: 0, binary: true });
  });

  it('handles the "Binary files …" marker line', () => {
    const out = parseNumStat('Binary files a/foo and b/foo differ\n');
    expect(out.get('foo')).toEqual({ additions: 0, deletions: 0, binary: true });
  });

  it('normalizes backslashes to POSIX', () => {
    const out = parseNumStat('1\t1\tsrc\\nested\\file.ts\n');
    expect(out.get('src/nested/file.ts')).toBeDefined();
  });

  it('tolerates malformed lines', () => {
    const out = parseNumStat('1\t1\tsrc/ok.ts\nthis is not a line\n2\t2\tsrc/another.ts\n');
    expect(out.size).toBe(2);
  });
});

describe('mapStatus', () => {
  it('returns empty arrays for an empty status', () => {
    const result = mapStatus(makeStatus(), ROOT);
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
    expect(result.conflicted).toEqual([]);
    expect(result.info).toEqual({ isRepo: true, root: ROOT, branch: 'main', gitAvailable: true });
  });

  it('maps a simple staged add to "added"', () => {
    const status = makeStatus({ created: ['src/new.ts'] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({
      relativePath: 'src/new.ts',
      path: '/repo/src/new.ts',
      status: 'added',
    });
  });

  it('maps a renamed file with its original path', () => {
    const renamed: StatusResultRenamed[] = [{ from: 'src/old.ts', to: 'src/new-name.ts' }];
    const status = makeStatus({ renamed, current: 'feature/x' });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({
      status: 'renamed',
      relativePath: 'src/new-name.ts',
      origPath: 'src/old.ts',
    });
  });

  it('maps an unstaged modification', () => {
    const status = makeStatus({ modified: ['src/foo.ts'] });
    const result = mapStatus(status, ROOT);
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ status: 'modified', relativePath: 'src/foo.ts' });
  });

  it('maps an unstaged deletion', () => {
    const status = makeStatus({ deleted: ['src/gone.ts'] });
    const result = mapStatus(status, ROOT);
    expect(result.unstaged[0]).toMatchObject({ status: 'deleted', relativePath: 'src/gone.ts' });
  });

  it('maps an untracked file to the unstaged bucket', () => {
    const status = makeStatus({ not_added: ['src/new.ts'] });
    const result = mapStatus(status, ROOT);
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ status: 'untracked', relativePath: 'src/new.ts' });
  });

  it('maps a conflict to the conflicted bucket only', () => {
    const status = makeStatus({ conflicted: ['src/merge.ts'] });
    const result = mapStatus(status, ROOT);
    expect(result.conflicted).toHaveLength(1);
    expect(result.conflicted[0]).toMatchObject({ status: 'conflicted' });
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
  });

  it('places a partially-staged file in BOTH buckets', () => {
    const files: FileStatusResult[] = [{ path: 'src/foo.ts', index: 'M', working_dir: 'M' }];
    const status = makeStatus({ files, modified: ['src/foo.ts'] });
    const result = mapStatus(status, ROOT);
    // From simple-git's `modified` array, the file is already in `unstaged`.
    // The partial-staging logic then ALSO adds it to `staged` because the
    // index side reports 'M'.
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ relativePath: 'src/foo.ts', status: 'modified' });
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ relativePath: 'src/foo.ts', status: 'modified' });
  });

  it('falls back to null branch on detached HEAD', () => {
    const status = makeStatus({ current: 'HEAD' });
    const result = mapStatus(status, ROOT);
    expect(result.info.branch).toBeNull();
  });

  it('applies numstat data to staged and unstaged buckets separately', () => {
    const unstagedStats = parseNumStat('4\t0\tsrc/foo.ts\n');
    const stagedStats = parseNumStat('2\t2\tsrc/foo.ts\n');
    const status = makeStatus({ created: ['src/foo.ts'], modified: ['src/foo.ts'] });
    const result = mapStatus(status, ROOT, unstagedStats, stagedStats);
    const stagedFoo = result.staged.find((c: GitFileChange) => c.relativePath === 'src/foo.ts');
    const unstagedFoo = result.unstaged.find((c: GitFileChange) => c.relativePath === 'src/foo.ts');
    expect(stagedFoo?.additions).toBe(2);
    expect(stagedFoo?.deletions).toBe(2);
    expect(unstagedFoo?.additions).toBe(4);
    expect(unstagedFoo?.deletions).toBe(0);
  });

  it('uses POSIX separators in the relative path', () => {
    const status = makeStatus({ created: ['src/nested/file.ts'] });
    const result = mapStatus(status, ROOT);
    expect(result.staged[0].relativePath).toBe('src/nested/file.ts');
  });

  it('returns no changes when no numstat map is supplied', () => {
    const status = makeStatus({ created: ['src/foo.ts'] });
    const result = mapStatus(status, ROOT, EMPTY_NUMSTAT, EMPTY_NUMSTAT);
    expect(result.staged[0].additions).toBeUndefined();
    expect(result.staged[0].deletions).toBeUndefined();
  });

  // ---- Porcelain-code based mapping (Critical #1) -----------------------

  it('staged-only modification: present in staged, absent from unstaged', () => {
    // Porcelain "M " = modified in index, working tree clean.
    const status = makeStatus({ files: [{ path: 'src/foo.ts', index: 'M', working_dir: ' ' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ status: 'modified', relativePath: 'src/foo.ts' });
    expect(result.unstaged).toEqual([]);
    expect(result.conflicted).toEqual([]);
  });

  it('staged-only deletion: present in staged, absent from unstaged', () => {
    // Porcelain "D " = deleted in index, working tree clean (still on disk).
    const status = makeStatus({ files: [{ path: 'src/gone.ts', index: 'D', working_dir: ' ' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ status: 'deleted', relativePath: 'src/gone.ts' });
    expect(result.unstaged).toEqual([]);
  });

  it('staged-only addition: present in staged, absent from unstaged', () => {
    // Porcelain "A " = added to index, working tree clean.
    const status = makeStatus({ files: [{ path: 'src/new.ts', index: 'A', working_dir: ' ' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ status: 'added', relativePath: 'src/new.ts' });
    expect(result.unstaged).toEqual([]);
  });

  it('partially-staged modification: present in BOTH staged and unstaged', () => {
    // Porcelain "MM" = modified in index AND modified in working tree.
    const status = makeStatus({ files: [{ path: 'src/foo.ts', index: 'M', working_dir: 'M' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ status: 'modified', relativePath: 'src/foo.ts' });
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ status: 'modified', relativePath: 'src/foo.ts' });
  });

  it('partially-staged addition: added in staged, modified in unstaged', () => {
    // Porcelain "AM" = added in index, then modified in working tree.
    const status = makeStatus({ files: [{ path: 'src/foo.ts', index: 'A', working_dir: 'M' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ status: 'added' });
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ status: 'modified' });
  });

  it('working-only modification: present in unstaged, absent from staged', () => {
    // Porcelain " M" = modified in working tree, index clean.
    const status = makeStatus({ files: [{ path: 'src/foo.ts', index: ' ', working_dir: 'M' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ status: 'modified', relativePath: 'src/foo.ts' });
  });

  it('working-only deletion: present in unstaged, absent from staged', () => {
    // Porcelain " D" = deleted in working tree, index clean.
    const status = makeStatus({ files: [{ path: 'src/foo.ts', index: ' ', working_dir: 'D' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ status: 'deleted' });
  });

  it('rename: staged only, with origPath set', () => {
    // Porcelain "R " = renamed in index. working_dir is ' ' (clean).
    const status = makeStatus({
      files: [{ path: 'src/new-name.ts', from: 'src/old.ts', index: 'R', working_dir: ' ' }],
    });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({
      status: 'renamed',
      relativePath: 'src/new-name.ts',
      origPath: 'src/old.ts',
    });
    expect(result.unstaged).toEqual([]);
  });

  it('untracked: only in unstaged bucket, only once', () => {
    // Porcelain "??" = untracked.
    const status = makeStatus({ files: [{ path: 'src/brand-new.ts', index: '?', working_dir: '?' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ status: 'untracked', relativePath: 'src/brand-new.ts' });
    expect(result.conflicted).toEqual([]);
  });

  it('conflicted: only in conflicted bucket, never duplicated', () => {
    // Porcelain "UU" = both sides modified (classic merge conflict).
    const status = makeStatus({ files: [{ path: 'src/merge.ts', index: 'U', working_dir: 'U' }] });
    const result = mapStatus(status, ROOT);
    expect(result.conflicted).toHaveLength(1);
    expect(result.conflicted[0]).toMatchObject({ status: 'conflicted', relativePath: 'src/merge.ts' });
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
  });

  it('all conflict codes surface in the conflicted bucket', () => {
    for (const pair of ['AA', 'UU', 'DD', 'AU', 'UA', 'UD', 'DU'] as const) {
      const index = pair[0];
      const wd = pair[1];
      const status = makeStatus({ files: [{ path: `src/${pair}.ts`, index, working_dir: wd }] });
      const result = mapStatus(status, ROOT);
      expect(result.conflicted).toHaveLength(1);
      expect(result.conflicted[0].relativePath).toBe(`src/${pair}.ts`);
      expect(result.staged).toEqual([]);
      expect(result.unstaged).toEqual([]);
    }
  });

  it('does NOT show staged-only files in the unstaged bucket (regression for Critical #1)', () => {
    // The previous implementation derived unstaged entries from
    // status.modified which CONTAINS staged-only files. With porcelain
    // codes we know a staged-only file has working_dir == ' '.
    const status = makeStatus({
      files: [
        { path: 'staged-only.ts', index: 'M', working_dir: ' ' },
        { path: 'working-only.ts', index: ' ', working_dir: 'M' },
      ],
    });
    const result = mapStatus(status, ROOT);
    const stagedOnly = result.unstaged.find((c) => c.relativePath === 'staged-only.ts');
    const workingOnly = result.staged.find((c) => c.relativePath === 'working-only.ts');
    expect(stagedOnly).toBeUndefined();
    expect(workingOnly).toBeUndefined();
    expect(result.staged.find((c) => c.relativePath === 'staged-only.ts')).toBeDefined();
    expect(result.unstaged.find((c) => c.relativePath === 'working-only.ts')).toBeDefined();
  });

  it('does NOT show working-only files in the staged bucket', () => {
    const status = makeStatus({ files: [{ path: 'work.ts', index: ' ', working_dir: 'M' }] });
    const result = mapStatus(status, ROOT);
    expect(result.staged.find((c) => c.relativePath === 'work.ts')).toBeUndefined();
    expect(result.unstaged.find((c) => c.relativePath === 'work.ts')).toBeDefined();
  });

  it('uses the supplied infoBranch (overrides status.current)', () => {
    const status = makeStatus({ current: 'main' });
    const result = mapStatus(status, ROOT, EMPTY_NUMSTAT, EMPTY_NUMSTAT, null);
    expect(result.info.branch).toBeNull();
  });

  it('passes through the status.current branch when infoBranch is undefined', () => {
    const status = makeStatus({ current: 'feature/x' });
    const result = mapStatus(status, ROOT);
    expect(result.info.branch).toBe('feature/x');
  });

  it('falls back to null branch on detached HEAD when infoBranch is undefined', () => {
    const status = makeStatus({ current: 'HEAD' });
    const result = mapStatus(status, ROOT);
    expect(result.info.branch).toBeNull();
  });
});
