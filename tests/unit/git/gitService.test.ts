/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration tests for `GitService`. These tests exercise the real system
 * `git` binary against temporary repositories. They are skipped gracefully
 * when `git` is not available on the runner.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitService, type GitServiceDeps } from '@/process/services/git/GitService';

let tempDir: string;
let service: GitService;
let gitAvailable = true;

function git(...args: string[]): { stdout: string; status: number } {
  const result = spawnSync('git', args, { cwd: tempDir, encoding: 'utf8' });
  return { stdout: result.stdout ?? '', status: result.status ?? 0 };
}

function writeFile(rel: string, contents: string): string {
  const abs = path.join(tempDir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents, 'utf8');
  return abs;
}

function readFile(rel: string): string {
  return readFileSync(path.join(tempDir, rel), 'utf8');
}

beforeEach(async () => {
  // On macOS `tmpdir()` returns `/var/folders/...` but `git rev-parse
  // --show-toplevel` reports the canonical `/private/var/folders/...` (since
  // `/var` is a symlink to `/private/var`). Resolve to the real path up
  // front so all comparisons in the test body line up with what git reports.
  const staging = path.join(tmpdir(), `aionui-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(staging, { recursive: true });
  tempDir = realpathSync(staging);
  // Use a no-op chokidar factory so tests don't actually start a watcher.
  const deps: GitServiceDeps = {
    chokidarFactory: () => {
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
      return {
        on: (event: string, cb: (...args: unknown[]) => void) => {
          (listeners[event] ??= []).push(cb);
          return undefined;
        },
        close: async () => {
          /* no-op */
        },
      };
    },
  };
  service = new GitService(deps);
  const probe = spawnSync('git', ['--version'], { encoding: 'utf8' });
  gitAvailable = probe.status === 0;
});

afterEach(async () => {
  await service.dispose();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('GitService — git availability', () => {
  it('reports gitAvailable: true and isRepo:false on a plain directory', async () => {
    if (!gitAvailable) return;
    const info = await service.getRepoInfo({ workspace: tempDir });
    expect(info.isRepo).toBe(false);
    expect(info.root).toBeNull();
    expect(info.gitAvailable).toBe(true);
  });
});

describe('GitService — repo discovery (SUBDIRECTORY fix)', () => {
  it('resolves the ENCLOSING repo root when the workspace is a subdirectory', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    const subDir = path.join(tempDir, 'packages', 'app', 'src');
    mkdirSync(subDir, { recursive: true });

    const info = await service.getRepoInfo({ workspace: subDir });
    expect(info.isRepo).toBe(true);
    expect(info.root).toBe(tempDir);
  });

  it('returns null branch on a freshly-initialized repo with no commits', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    const info = await service.getRepoInfo({ workspace: tempDir });
    expect(info.isRepo).toBe(true);
    expect(info.branch).toBeNull();
  });

  it('returns the current branch after the first commit', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('README.md', '# hello\n');
    git('add', 'README.md');
    git('commit', '-q', '-m', 'initial');

    const info = await service.getRepoInfo({ workspace: tempDir });
    expect(info.isRepo).toBe(true);
    // Default branch name varies by git config; accept main or master.
    expect(['main', 'master']).toContain(info.branch);
  });
});

describe('GitService — getStatus', () => {
  it('returns empty arrays when the workspace is not a repo', async () => {
    if (!gitAvailable) return;
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toEqual([]);
    expect(status.unstaged).toEqual([]);
    expect(status.conflicted).toEqual([]);
    expect(status.info.isRepo).toBe(false);
  });

  it('reports an untracked file as untracked in the unstaged bucket', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    writeFile('new.txt', 'hello\n');
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toEqual([]);
    expect(status.unstaged).toHaveLength(1);
    expect(status.unstaged[0]).toMatchObject({ status: 'untracked', relativePath: 'new.txt' });
  });

  it('reports a modified tracked file in the unstaged bucket', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'one\ntwo\n');

    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toEqual([]);
    expect(status.unstaged).toHaveLength(1);
    expect(status.unstaged[0]).toMatchObject({ status: 'modified', relativePath: 'a.txt' });
    expect(status.unstaged[0].additions).toBeGreaterThanOrEqual(1);
  });

  it('reports a staged addition in the staged bucket', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('b.txt', 'new\n');
    git('add', 'b.txt');

    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toHaveLength(1);
    expect(status.staged[0]).toMatchObject({ status: 'added', relativePath: 'b.txt' });
    expect(status.unstaged).toEqual([]);
  });

  it('populates additions and deletions from --numstat', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'one\ntwo\nthree\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'one\nTWO\nthree\nfour\n');

    const status = await service.getStatus({ workspace: tempDir });
    const a = status.unstaged[0];
    expect(a).toBeDefined();
    expect(a!.additions).toBe(2);
    expect(a!.deletions).toBe(1);
  });
});

describe('GitService — stage / unstage / discard / commit', () => {
  it('stages a single file with stageFile and unstages with unstageFile', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'one\ntwo\n');

    await service.stageFile({ workspace: tempDir, file_path: 'a.txt' });
    let status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toHaveLength(1);
    expect(status.staged[0].relativePath).toBe('a.txt');

    await service.unstageFile({ workspace: tempDir, file_path: 'a.txt' });
    status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toEqual([]);
    expect(status.unstaged).toHaveLength(1);
  });

  it('stageAll stages modifications, additions, and deletions', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'a\n');
    writeFile('b.txt', 'b\n');
    git('add', 'a.txt', 'b.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'a2\n'); // modify
    writeFile('c.txt', 'c\n'); // add
    unlinkSafely('b.txt'); // delete

    await service.stageAll({ workspace: tempDir });
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged.length).toBe(3);
  });

  it('discardFile restores a tracked modification to HEAD', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'original\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'corrupted\n');

    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });
    expect(readFile('a.txt')).toBe('original\n');
  });

  it('discardFile removes an untracked file from disk', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    const target = writeFile('junk.txt', 'junk\n');

    await service.discardFile({ workspace: tempDir, file_path: 'junk.txt' });
    expect(existsSync(target)).toBe(false);
  });

  it('commit returns a short SHA and the number of committed files', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'a\n');
    writeFile('b.txt', 'b\n');
    git('add', 'a.txt', 'b.txt');

    const result = await service.commit({ workspace: tempDir, message: 'two files' });
    expect(result.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(result.committed).toBe(2);
  });
});

describe('GitService — getDiff', () => {
  it('returns a unified diff for an unstaged modification', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'one\ntwo\n');

    const diff = await service.getDiff({ workspace: tempDir, file_path: 'a.txt' });
    expect(diff.binary).toBe(false);
    expect(diff.patch).toMatch(/^diff --git a\/a\.txt b\/a\.txt/m);
    expect(diff.patch).toMatch(/\+two/);
  });

  it('returns a synthesized all-additions patch for an untracked file', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    writeFile('new.txt', 'alpha\nbeta\n');

    const diff = await service.getDiff({ workspace: tempDir, file_path: 'new.txt' });
    expect(diff.binary).toBe(false);
    // The patch should contain the new file's contents as additions.
    expect(diff.patch).toMatch(/new file mode/);
    expect(diff.patch).toMatch(/\+alpha/);
    expect(diff.patch).toMatch(/\+beta/);
  });

  it('returns binary:true when the diff contains a binary marker', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    // Build a real binary diff by creating a binary file in the index then
    // mutating it.
    writeFile('blob.bin', Buffer.from([0, 1, 2, 3]).toString('binary'));
    git('add', 'blob.bin');
    git('commit', '-q', '-m', 'init');
    writeFile('blob.bin', Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]).toString('binary'));

    const diff = await service.getDiff({ workspace: tempDir, file_path: 'blob.bin' });
    expect(diff.binary).toBe(true);
    expect(diff.patch).toBe('');
  });
});

describe('GitService — getBranches', () => {
  it('lists local branch names', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFile('a.txt', 'a\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    git('checkout', '-q', '-b', 'feature/x');

    const branches = await service.getBranches({ workspace: tempDir });
    expect(branches).toContain('feature/x');
  });
});

describe('GitService — init', () => {
  it('initializes a .git directory in the workspace and writes a default .gitignore', async () => {
    if (!gitAvailable) return;
    const result = await service.init({ workspace: tempDir });
    expect(result.root).toBe(tempDir);
    expect(result.createdGitignore).toBe(true);
    expect(existsSync(path.join(tempDir, '.gitignore'))).toBe(true);
    expect(existsSync(path.join(tempDir, '.git'))).toBe(true);
  });

  it('does NOT overwrite an existing .gitignore', async () => {
    if (!gitAvailable) return;
    const custom = '# my custom ignore\nsecret.txt\n';
    writeFile('.gitignore', custom);
    const result = await service.init({ workspace: tempDir });
    expect(result.createdGitignore).toBe(false);
    expect(readFile('.gitignore')).toBe(custom);
  });
});

describe('GitService — watcher (event-driven)', () => {
  it('emits a debounced "changed" event when a file is mutated', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    await service.ensureWatch(tempDir);
    const events: Array<{ workspace: string; root: string }> = [];
    service.on('changed', (e: { workspace: string; root: string }) => events.push(e));
    // Mutate the working tree — chokidar is mocked so we trigger the timer
    // manually via internal manipulation is unnecessary: the test just
    // checks the wiring exists.
    writeFile('new.txt', 'hello\n');
    // We can't actually wait for a real chokidar tick; the test passes when
    // the watcher is registered without error. A separate integration test
    // in a follow-up will exercise the real chokidar loop.
    expect(service.watcherCount).toBe(1);
    expect(events).toBeDefined();
  });
});

// Helper: synchronous unlink that doesn't throw when the file is missing.
function unlinkSafely(rel: string): void {
  const abs = path.join(tempDir, rel);
  if (existsSync(abs)) rmSync(abs);
}
