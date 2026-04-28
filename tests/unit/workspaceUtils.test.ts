import { describe, expect, it } from 'vitest';

import {
  getLastDirectoryName,
  getWorkspaceDisplayName,
  isTemporaryWorkspace,
} from '@/renderer/utils/workspace/workspace';

describe('workspace utils', () => {
  it('shows only the last directory for Unix-style workspace paths', () => {
    expect(getWorkspaceDisplayName('/Users/demo/projects/AionUi')).toBe('AionUi');
  });

  it('shows only the last directory for Windows-style workspace paths', () => {
    expect(getWorkspaceDisplayName('E:\\code\\taichuCode\\AionUi')).toBe('AionUi');
  });

  it('detects legacy temporary workspaces on Windows-style paths', () => {
    expect(isTemporaryWorkspace('C:\\Users\\demo\\codex-temp-1741680000000')).toBe(true);
  });

  it('detects current-convention temporary workspaces under conversations/<uuid>', () => {
    expect(isTemporaryWorkspace('/Users/demo/Library/AionUi/conversations/3f7a1f38-8b74-4cc2-9e11-1a6f2b5f8f10')).toBe(
      true
    );
  });

  it('treats user-specified workspaces as non-temporary', () => {
    expect(isTemporaryWorkspace('/Users/demo/projects/AionUi')).toBe(false);
    // Looks like a uuid but not under `conversations/` → not temporary.
    expect(isTemporaryWorkspace('/Users/demo/3f7a1f38-8b74-4cc2-9e11-1a6f2b5f8f10')).toBe(false);
  });

  it('labels new-convention temp workspaces with the generic temporary-session label', () => {
    expect(
      getWorkspaceDisplayName('/Users/demo/Library/AionUi/conversations/3f7a1f38-8b74-4cc2-9e11-1a6f2b5f8f10')
    ).toBe('Temporary Session');
  });

  it('extracts the last directory name from Windows-style paths', () => {
    expect(getLastDirectoryName('D:\\workspace\\feature-demo')).toBe('feature-demo');
  });
});
