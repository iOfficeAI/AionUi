import { describe, expect, it } from 'vitest';

import { getLastDirectoryName, getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';

describe('workspace utils', () => {
  it('shows only the last directory for Unix-style workspace paths when not temporary', () => {
    expect(getWorkspaceDisplayName('/Users/demo/projects/AionUi', false)).toBe('AionUi');
  });

  it('shows only the last directory for Windows-style workspace paths when not temporary', () => {
    expect(getWorkspaceDisplayName('E:\\code\\taichuCode\\AionUi', false)).toBe('AionUi');
  });

  it('returns the temporary-session label when isTemporaryWorkspace is true', () => {
    expect(getWorkspaceDisplayName('/any/path/ignored/when/temp', true)).toBe('Temporary Session');
  });

  it('routes the localized label through the provided translator', () => {
    const t = (key: string) => (key === 'conversation.workspace.temporarySpace' ? '临时会话' : key);
    expect(getWorkspaceDisplayName('/irrelevant', true, t)).toBe('临时会话');
  });

  it('extracts the last directory name from Windows-style paths', () => {
    expect(getLastDirectoryName('D:\\workspace\\feature-demo')).toBe('feature-demo');
  });
});
