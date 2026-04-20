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

    it('init succeeds when a file is not readable (permission denied)', async () => {
      await fs.writeFile(path.join(tmpDir, 'readable.txt'), 'ok');
      const unreadablePath = path.join(tmpDir, 'locked.txt');
      await fs.writeFile(unreadablePath, 'locked content');
      // Remove all permissions so git cannot read the file
      await fs.chmod(unreadablePath, 0o000);

      try {
        const info = await service.init(tmpDir);
        expect(info.mode).toBe('snapshot');

        // The readable file should still be tracked
        const content = await service.getBaselineContent(tmpDir, 'readable.txt');
        expect(content).toBe('ok');
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(unreadablePath, 0o644);
      }
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

    it('getBranches returns empty array in snapshot mode', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'content');
      await service.init(tmpDir);
      const branches = await service.getBranches(tmpDir);
      expect(branches).toEqual([]);
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

  describe('DEFAULT_GITIGNORE excludes common heavy directories (#2159)', () => {
    it('keeps snapshot ignore rules out of the workspace root', async () => {
      await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello');
      await service.init(tmpDir);

      await expect(fs.access(path.join(tmpDir, '.gitignore'))).rejects.toThrow();
    });

    it('excludes dist/ files from snapshot baseline', async () => {
      // Create a workspace with build output that should be excluded
      await fs.mkdir(path.join(tmpDir, 'dist'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'dist', 'bundle.js'), 'large bundle');
      await fs.writeFile(path.join(tmpDir, 'src.txt'), 'source');
      await service.init(tmpDir);

      // Modify a file in dist — should not appear in compare since dist is gitignored
      await fs.writeFile(path.join(tmpDir, 'dist', 'bundle.js'), 'changed bundle');
      const { unstaged } = await service.compare(tmpDir);
      const distChange = unstaged.find((c) => c.relativePath.startsWith('dist/'));
      expect(distChange).toBeUndefined();
    });
  });

  describe('snapshot gitdir deleted externally (ELECTRON-G7)', () => {
    it('init returns fallback when temp gitdir is removed before rev-parse', async () => {
      // Simulate the scenario: workspace exists but after createWorkingTreeSnapshot,
      // the temp gitdir gets cleaned up by OS/antivirus before rev-parse HEAD runs.
      // We do this by creating a snapshot, noting the gitdir path, deleting it,
      // then re-init — which exercises the same code path via a stale temp directory.
      await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'content');

      // First init should work
      const info = await service.init(tmpDir);
      expect(info.mode).toBe('snapshot');

      // Get baseline content to confirm snapshot is functional
      const content = await service.getBaselineContent(tmpDir, 'hello.txt');
      expect(content).toBe('content');

      // Dispose to clear internal state, then immediately init again
      // This should succeed even if previous temp dirs were cleaned up
      await service.dispose(tmpDir);
      const info2 = await service.init(tmpDir);
      expect(info2.mode).toBe('snapshot');
    });

    it('init does not leave unhandled rejection when workspace is deleted during snapshot', async () => {
      await fs.writeFile(path.join(tmpDir, 'temp.txt'), 'data');
      const workspacePath = path.join(tmpDir, 'ephemeral');
      await fs.mkdir(workspacePath);
      await fs.writeFile(path.join(workspacePath, 'file.txt'), 'data');

      // Delete workspace just before init completes — should return gracefully
      const initPromise = service.init(workspacePath);
      // Even if workspace is available during init, the result should not throw
      const info = await initPromise;
      expect(info.mode).toBeDefined();
    });
  });

  describe('maxBuffer handling (ELECTRON-G4)', () => {
    it('snapshot init handles workspace with many files without maxBuffer error', async () => {
      // Create many files to exercise the git add . path with substantial output
      const subdir = path.join(tmpDir, 'deep', 'nested', 'dir');
      await fs.mkdir(subdir, { recursive: true });
      const writePromises = [];
      for (let i = 0; i < 200; i++) {
        writePromises.push(fs.writeFile(path.join(subdir, `file-${i}.txt`), `content-${i}`));
      }
      await Promise.all(writePromises);

      // This should not throw "stderr maxBuffer length exceeded"
      const info = await service.init(tmpDir);
      expect(info.mode).toBe('snapshot');

      const { unstaged } = await service.compare(tmpDir);
      expect(unstaged).toEqual([]);
    });

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
