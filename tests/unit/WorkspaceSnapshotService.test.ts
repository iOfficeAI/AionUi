import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { WorkspaceSnapshotService } from '../../src/process/services/WorkspaceSnapshotService';

const exec = promisify(execFile);

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
      const { unstaged } = await service.compare(tmpDir);

      const created = unstaged.find((c) => c.relativePath === 'b.txt');
      expect(created).toBeDefined();
      expect(created!.operation).toBe('create');
    });

    it('compare detects modified file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'modified content');
      const { unstaged } = await service.compare(tmpDir);

      const modified = unstaged.find((c) => c.relativePath === 'a.txt');
      expect(modified).toBeDefined();
      expect(modified!.operation).toBe('modify');
    });

    it('compare detects deleted file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.unlink(path.join(tmpDir, 'a.txt'));
      const { unstaged } = await service.compare(tmpDir);

      const deleted = unstaged.find((c) => c.relativePath === 'a.txt');
      expect(deleted).toBeDefined();
      expect(deleted!.operation).toBe('delete');
    });

    it('compare returns empty when nothing changed', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      const { staged, unstaged } = await service.compare(tmpDir);
      expect(staged).toEqual([]);
      expect(unstaged).toEqual([]);
    });

    it('snapshot mode has no staged files', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'modified content');
      const { staged } = await service.compare(tmpDir);
      expect(staged).toEqual([]);
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

    it('resetFile restores modified file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'modified content');
      await service.resetFile(tmpDir, 'a.txt', 'modify');

      const content = await fs.readFile(path.join(tmpDir, 'a.txt'), 'utf-8');
      expect(content).toBe('original');
    });

    it('resetFile deletes created file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'new.txt'), 'new file');
      await service.resetFile(tmpDir, 'new.txt', 'create');

      await expect(fs.access(path.join(tmpDir, 'new.txt'))).rejects.toThrow();
    });

    it('dispose cleans up temp gitdir', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'content');
      await service.init(tmpDir);

      await service.dispose(tmpDir);

      const { staged, unstaged } = await service.compare(tmpDir);
      expect(staged).toEqual([]);
      expect(unstaged).toEqual([]);
    });
  });

  describe('git-repo mode (has .git)', () => {
    beforeEach(async () => {
      await exec('git', ['init'], { cwd: tmpDir });
      await exec(
        'git',
        ['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '--allow-empty', '-m', 'init'],
        { cwd: tmpDir }
      );
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'initial');
      await exec('git', ['add', 'initial.txt'], { cwd: tmpDir });
      await exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'add initial'], {
        cwd: tmpDir,
      });
    });

    it('init returns git-repo mode with branch name', async () => {
      const info = await service.init(tmpDir);
      expect(info.mode).toBe('git-repo');
      expect(typeof info.branch).toBe('string');
      expect(info.branch!.length).toBeGreaterThan(0);
    });

    it('compare shows unstaged modification', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed content');

      const { unstaged } = await service.compare(tmpDir);
      const modified = unstaged.find((c) => c.relativePath === 'initial.txt');
      expect(modified).toBeDefined();
      expect(modified!.operation).toBe('modify');
    });

    it('compare shows untracked file as unstaged create', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'newfile.txt'), 'new');

      const { unstaged } = await service.compare(tmpDir);
      const created = unstaged.find((c) => c.relativePath === 'newfile.txt');
      expect(created).toBeDefined();
      expect(created!.operation).toBe('create');
    });

    it('stageFile moves file to staged', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed content');

      await service.stageFile(tmpDir, 'initial.txt');
      const { staged, unstaged } = await service.compare(tmpDir);

      expect(staged.find((c) => c.relativePath === 'initial.txt')).toBeDefined();
      expect(unstaged.find((c) => c.relativePath === 'initial.txt')).toBeUndefined();
    });

    it('unstageFile moves file back to unstaged', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed content');

      await service.stageFile(tmpDir, 'initial.txt');
      await service.unstageFile(tmpDir, 'initial.txt');
      const { staged, unstaged } = await service.compare(tmpDir);

      expect(staged.find((c) => c.relativePath === 'initial.txt')).toBeUndefined();
      expect(unstaged.find((c) => c.relativePath === 'initial.txt')).toBeDefined();
    });

    it('stageAll stages all changes', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed content');
      await fs.writeFile(path.join(tmpDir, 'newfile.txt'), 'new');

      await service.stageAll(tmpDir);
      const { staged, unstaged } = await service.compare(tmpDir);

      expect(staged.length).toBe(2);
      expect(unstaged.length).toBe(0);
    });

    it('discardFile restores modified file', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed content');

      await service.discardFile(tmpDir, 'initial.txt', 'modify');

      const content = await fs.readFile(path.join(tmpDir, 'initial.txt'), 'utf-8');
      expect(content).toBe('initial');
    });

    it('discardFile deletes untracked file', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'newfile.txt'), 'new');

      await service.discardFile(tmpDir, 'newfile.txt', 'create');

      await expect(fs.access(path.join(tmpDir, 'newfile.txt'))).rejects.toThrow();
    });

    it('getBaselineContent returns HEAD version', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed content');

      const content = await service.getBaselineContent(tmpDir, 'initial.txt');
      expect(content).toBe('initial');
    });

    it('getInfo returns correct mode and branch', async () => {
      await service.init(tmpDir);
      const info = await service.getInfo(tmpDir);
      expect(info.mode).toBe('git-repo');
      expect(typeof info.branch).toBe('string');
    });
  });
});
