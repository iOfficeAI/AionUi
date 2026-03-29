import { describe, it, expect } from 'vitest';
import type { CompareResult, FileChangeInfo, SnapshotInfo } from '../../src/common/types/fileSnapshot';

describe('FileChangeInfo type', () => {
  it('represents a created file', () => {
    const info: FileChangeInfo = {
      filePath: '/workspace/src/new.ts',
      relativePath: 'src/new.ts',
      operation: 'create',
    };
    expect(info.operation).toBe('create');
  });

  it('represents a modified file', () => {
    const info: FileChangeInfo = {
      filePath: '/workspace/src/index.ts',
      relativePath: 'src/index.ts',
      operation: 'modify',
    };
    expect(info.operation).toBe('modify');
  });

  it('represents a deleted file', () => {
    const info: FileChangeInfo = {
      filePath: '/workspace/src/old.ts',
      relativePath: 'src/old.ts',
      operation: 'delete',
    };
    expect(info.operation).toBe('delete');
  });
});

describe('SnapshotInfo type', () => {
  it('represents git-repo mode with branch', () => {
    const info: SnapshotInfo = { mode: 'git-repo', branch: 'main' };
    expect(info.mode).toBe('git-repo');
    expect(info.branch).toBe('main');
  });

  it('represents snapshot mode without branch', () => {
    const info: SnapshotInfo = { mode: 'snapshot', branch: null };
    expect(info.mode).toBe('snapshot');
    expect(info.branch).toBeNull();
  });
});

describe('CompareResult type', () => {
  it('represents staged and unstaged changes', () => {
    const result: CompareResult = {
      staged: [{ filePath: '/ws/a.ts', relativePath: 'a.ts', operation: 'modify' }],
      unstaged: [{ filePath: '/ws/b.ts', relativePath: 'b.ts', operation: 'create' }],
    };
    expect(result.staged).toHaveLength(1);
    expect(result.unstaged).toHaveLength(1);
  });
});
