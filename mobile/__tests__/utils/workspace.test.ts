import { getWorkspaceDisplayName, isTemporaryWorkspace, getLastDirectoryName } from '../../src/utils/workspace';

describe('workspace utils', () => {
  describe('isTemporaryWorkspace', () => {
    it('detects temp workspace with backend prefix', () => {
      expect(isTemporaryWorkspace('/tmp/codex-temp-1234567890')).toBe(true);
      expect(isTemporaryWorkspace('/tmp/gemini-temp-9999999999')).toBe(true);
      expect(isTemporaryWorkspace('C:\\Users\\test\\claude-temp-1234567890')).toBe(true);
    });

    it('returns false for regular workspaces', () => {
      expect(isTemporaryWorkspace('/home/user/my-project')).toBe(false);
      expect(isTemporaryWorkspace('/tmp/some-folder')).toBe(false);
    });
  });

  describe('getWorkspaceDisplayName', () => {
    it('returns last directory segment for regular path', () => {
      expect(getWorkspaceDisplayName('/home/user/my-project')).toBe('my-project');
      expect(getWorkspaceDisplayName('/Users/xavier/projects/AionUi')).toBe('AionUi');
    });

    it('returns temporary session label for temp workspace', () => {
      const name = getWorkspaceDisplayName('/tmp/codex-temp-1700000000');
      expect(name).toContain('Temporary Session');
    });

    it('uses translation function when provided', () => {
      const t = (key: string) => (key === 'workspace.temporarySpace' ? 'Temp' : key);
      const name = getWorkspaceDisplayName('/tmp/codex-temp-1700000000', t);
      expect(name).toContain('Temp');
    });

    it('supports non-English translation for temporary workspace labels', () => {
      const t = (key: string) => (key === 'workspace.temporarySpace' ? '临时会话' : key);
      const name = getWorkspaceDisplayName('/tmp/codex-temp-1700000000', t);
      expect(name).toContain('临时会话');
      expect(name).not.toContain('Temporary Session');
    });

    it('handles Windows-style paths', () => {
      expect(getWorkspaceDisplayName('C:\\Users\\dev\\project')).toBe('project');
    });
  });

  describe('getLastDirectoryName', () => {
    it('extracts last path segment', () => {
      expect(getLastDirectoryName('/a/b/c')).toBe('c');
      expect(getLastDirectoryName('single')).toBe('single');
    });
  });
});
