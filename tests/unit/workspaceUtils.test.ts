import { describe, expect, it } from 'vitest';

import { getLastDirectoryName, getWorkspaceDisplayName, isTemporaryWorkspace } from '@/renderer/utils/workspace';

describe('workspace utils', () => {
  it('shows only the last directory for Unix-style workspace paths', () => {
    expect(getWorkspaceDisplayName('/Users/demo/projects/AionUi')).toBe('AionUi');
  });

  it('shows only the last directory for Windows-style workspace paths', () => {
    expect(getWorkspaceDisplayName('E:\\code\\taichuCode\\AionUi')).toBe('AionUi');
  });

  it('detects temporary workspaces on Windows-style paths', () => {
    expect(isTemporaryWorkspace('C:\\Users\\demo\\codex-temp-1741680000000')).toBe(true);
  });

  it('extracts the last directory name from Windows-style paths', () => {
    expect(getLastDirectoryName('D:\\workspace\\feature-demo')).toBe('feature-demo');
  });
});
