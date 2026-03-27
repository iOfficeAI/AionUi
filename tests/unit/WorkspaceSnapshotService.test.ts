import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import git from 'isomorphic-git';
import { WorkspaceSnapshotService } from '../../src/process/services/WorkspaceSnapshotService';

describe('WorkspaceSnapshotService', () => {
  let service: WorkspaceSnapshotService;
  let tmpDir: string;

  beforeEach(async () => {
    service = new WorkspaceSnapshotService();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
  });

  afterEach(async () => {
    await service.disposeAll().catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('snapshot mode (no .git)', () => {
    it('init returns snapshot mode with null branch', async () => {
      await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello');
      const info = await service.init(tmpDir);
      expect(info.mode).toBe('snapshot');
      expect(info.branch).toBeNull();
    });

    it('compare detects new file as create', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'b.txt'), 'new file');
      const changes = await service.compare(tmpDir);

      const created = changes.find((c) => c.relativePath === 'b.txt');
      expect(created).toBeDefined();
      expect(created!.operation).toBe('create');
    });

    it('compare detects modified file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      // Use different-length content so stat-based comparison detects the change
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'modified with extra content');
      const changes = await service.compare(tmpDir);

      const modified = changes.find((c) => c.relativePath === 'a.txt');
      expect(modified).toBeDefined();
      expect(modified!.operation).toBe('modify');
    });

    it('compare detects deleted file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.unlink(path.join(tmpDir, 'a.txt'));
      const changes = await service.compare(tmpDir);

      const deleted = changes.find((c) => c.relativePath === 'a.txt');
      expect(deleted).toBeDefined();
      expect(deleted!.operation).toBe('delete');
    });

    it('compare returns empty array when nothing changed', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      const changes = await service.compare(tmpDir);
      expect(changes).toEqual([]);
    });

    it('getBaselineContent returns original content', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original content');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'modified content');
      const content = await service.getBaselineContent(tmpDir, 'a.txt');
      expect(content).toBe('original content');
    });

    it('getBaselineContent returns null for non-existent file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      const content = await service.getBaselineContent(tmpDir, 'nonexistent.txt');
      expect(content).toBeNull();
    });

    it('respects .gitignore', async () => {
      await fs.writeFile(path.join(tmpDir, '.gitignore'), 'ignored.txt\n');
      await fs.writeFile(path.join(tmpDir, 'tracked.txt'), 'tracked');
      await fs.writeFile(path.join(tmpDir, 'ignored.txt'), 'ignored');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'ignored.txt'), 'changed ignored content that is longer');
      await fs.writeFile(path.join(tmpDir, 'tracked.txt'), 'changed tracked content that is longer');
      const changes = await service.compare(tmpDir);

      expect(changes.some((c) => c.relativePath === 'tracked.txt')).toBe(true);
      expect(changes.some((c) => c.relativePath === 'ignored.txt')).toBe(false);
    });

    it('dispose cleans up temp gitdir', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'content');
      await service.init(tmpDir);

      await service.dispose(tmpDir);

      // After dispose, compare should return empty
      const changes = await service.compare(tmpDir);
      expect(changes).toEqual([]);
    });
  });

  describe('git-repo mode (has .git)', () => {
    beforeEach(async () => {
      await git.init({ fs: nodeFs, dir: tmpDir });
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'initial');
      await git.add({ fs: nodeFs, dir: tmpDir, filepath: 'initial.txt' });
      await git.commit({
        fs: nodeFs,
        dir: tmpDir,
        message: 'initial commit',
        author: { name: 'Test', email: 'test@test.com' },
      });
    });

    it('init returns git-repo mode with branch name', async () => {
      const info = await service.init(tmpDir);
      expect(info.mode).toBe('git-repo');
      expect(info.branch).toBe('master');
    });

    it('compare detects uncommitted changes', async () => {
      await service.init(tmpDir);
      // Use different-length content so stat-based comparison detects the change
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed with extra content');

      const changes = await service.compare(tmpDir);
      const modified = changes.find((c) => c.relativePath === 'initial.txt');
      expect(modified).toBeDefined();
      expect(modified!.operation).toBe('modify');
    });

    it('compare detects new untracked file', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'newfile.txt'), 'new');

      const changes = await service.compare(tmpDir);
      const created = changes.find((c) => c.relativePath === 'newfile.txt');
      expect(created).toBeDefined();
      expect(created!.operation).toBe('create');
    });

    it('getBaselineContent returns HEAD version', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed with extra content');

      const content = await service.getBaselineContent(tmpDir, 'initial.txt');
      expect(content).toBe('initial');
    });

    it('getInfo returns correct mode and branch', async () => {
      await service.init(tmpDir);
      const info = await service.getInfo(tmpDir);
      expect(info.mode).toBe('git-repo');
      expect(info.branch).toBe('master');
    });
  });
});
