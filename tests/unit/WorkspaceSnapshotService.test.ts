import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { WorkspaceSnapshotService } from '../../src/process/services/WorkspaceSnapshotService';

const exec = promisify(execFile);
const SNAPSHOT_TEMP_PREFIX = 'aionui-snapshot-';

async function listSnapshotEntries(tmpRoot: string): Promise<string[]> {
  const entries = await fs.readdir(tmpRoot);
  return entries.filter((name) => name.startsWith(SNAPSHOT_TEMP_PREFIX));
}

describe('WorkspaceSnapshotService', () => {
  let service: WorkspaceSnapshotService;
  let tmpDir: string;

  beforeEach(async () => {
    service = new WorkspaceSnapshotService();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await service.disposeAll().catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('snapshot mode (no .git)', () => {
    it('init returns snapshot mode without creating a temp snapshot directory', async () => {
      const testTmpRoot = path.join(tmpDir, 'isolated-tmp');
      await fs.mkdir(testTmpRoot);
      vi.spyOn(os, 'tmpdir').mockReturnValue(testTmpRoot);
      await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello');

      const info = await service.init(tmpDir);
      const leakedSnapshots = await listSnapshotEntries(testTmpRoot);

      expect(info).toEqual({ mode: 'snapshot', branch: null });
      expect(leakedSnapshots).toEqual([]);
    });

    it('init succeeds when a file is not readable', async () => {
      await fs.writeFile(path.join(tmpDir, 'readable.txt'), 'ok');
      const unreadablePath = path.join(tmpDir, 'locked.txt');
      await fs.writeFile(unreadablePath, 'locked content');
      await fs.chmod(unreadablePath, 0o000);

      try {
        const info = await service.init(tmpDir);
        expect(info).toEqual({ mode: 'snapshot', branch: null });
      } finally {
        await fs.chmod(unreadablePath, 0o644);
      }
    });

    it('compare stays empty after files are created, modified, and deleted', async () => {
      const deletedPath = path.join(tmpDir, 'deleted.txt');
      await fs.writeFile(path.join(tmpDir, 'modified.txt'), 'original');
      await fs.writeFile(deletedPath, 'remove me');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'created.txt'), 'new file');
      await fs.writeFile(path.join(tmpDir, 'modified.txt'), 'modified content');
      await fs.unlink(deletedPath);
      const changes = await service.compare(tmpDir);

      expect(changes).toEqual({ staged: [], unstaged: [] });
    });

    it('getBaselineContent returns null for non-git workspaces', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original content');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'modified content');
      const content = await service.getBaselineContent(tmpDir, 'a.txt');

      expect(content).toBeNull();
    });

    it('getBranches returns empty array in snapshot mode', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'content');
      await service.init(tmpDir);

      const branches = await service.getBranches(tmpDir);

      expect(branches).toEqual([]);
    });

    it('resetFile leaves modified files unchanged', async () => {
      const filePath = path.join(tmpDir, 'a.txt');
      await fs.writeFile(filePath, 'original');
      await service.init(tmpDir);

      await fs.writeFile(filePath, 'modified content');
      await service.resetFile(tmpDir, 'a.txt', 'modify');
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toBe('modified content');
    });

    it('resetFile leaves created files in place', async () => {
      await service.init(tmpDir);
      const filePath = path.join(tmpDir, 'new.txt');
      await fs.writeFile(filePath, 'new file');

      await service.resetFile(tmpDir, 'new.txt', 'create');
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toBe('new file');
    });

    it('dispose keeps compare safe for non-git workspaces', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'content');
      await service.init(tmpDir);

      await service.dispose(tmpDir);
      const changes = await service.compare(tmpDir);

      expect(changes).toEqual({ staged: [], unstaged: [] });
    });
  });

  describe('stale snapshot cleanup', () => {
    it('removes old aionui-snapshot directories without deleting unrelated temp entries', async () => {
      const testTmpRoot = path.join(tmpDir, 'isolated-tmp');
      const staleSnapshot = path.join(testTmpRoot, `${SNAPSHOT_TEMP_PREFIX}old`);
      const unrelatedDir = path.join(testTmpRoot, 'aionui-other');
      await fs.mkdir(staleSnapshot, { recursive: true });
      await fs.mkdir(unrelatedDir);
      vi.spyOn(os, 'tmpdir').mockReturnValue(testTmpRoot);

      await WorkspaceSnapshotService.cleanupStaleSnapshots();

      await expect(fs.access(staleSnapshot)).rejects.toThrow();
      await expect(fs.access(unrelatedDir)).resolves.toBeUndefined();
    });

    it('returns safely when the temp directory cannot be read', async () => {
      vi.spyOn(os, 'tmpdir').mockReturnValue(path.join(tmpDir, 'missing-tmp'));

      await expect(WorkspaceSnapshotService.cleanupStaleSnapshots()).resolves.toBeUndefined();
    });
  });

  describe('non-existent workspace', () => {
    it('init returns snapshot default when workspace directory does not exist', async () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      const info = await service.init(nonExistent);
      expect(info.mode).toBe('snapshot');
      expect(info.branch).toBeNull();
    });

    it('init returns snapshot default when workspace path is a file, not a directory', async () => {
      const filePath = path.join(tmpDir, 'a-file.txt');
      await fs.writeFile(filePath, 'not a directory');
      const info = await service.init(filePath);
      expect(info.mode).toBe('snapshot');
      expect(info.branch).toBeNull();
    });

    it('init does not register a snapshot state for non-existent workspace', async () => {
      const nonExistent = path.join(tmpDir, 'gone');
      await service.init(nonExistent);
      const info = await service.getInfo(nonExistent);
      expect(info.mode).toBe('snapshot');
      expect(info.branch).toBeNull();
    });

    it('getBranches returns empty array for uninitialised workspace', async () => {
      const branches = await service.getBranches(path.join(tmpDir, 'nope'));
      expect(branches).toEqual([]);
    });

    it('compare returns empty for workspace that was removed before init', async () => {
      const nonExistent = path.join(tmpDir, 'removed');
      await service.init(nonExistent);
      const { staged, unstaged } = await service.compare(nonExistent);
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

  describe('maxBuffer handling (ELECTRON-G4)', () => {
    it('stageAll handles many files without maxBuffer error', async () => {
      await exec('git', ['init'], { cwd: tmpDir });
      await exec(
        'git',
        ['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '--allow-empty', '-m', 'init'],
        { cwd: tmpDir }
      );
      await service.init(tmpDir);

      const writePromises = [];
      for (let i = 0; i < 200; i++) {
        writePromises.push(fs.writeFile(path.join(tmpDir, `file-${i}.txt`), `content-${i}`));
      }
      await Promise.all(writePromises);

      // This should not throw "stderr maxBuffer length exceeded"
      await service.stageAll(tmpDir);

      const { staged } = await service.compare(tmpDir);
      expect(staged.length).toBe(200);
    });
  });
});
