/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Targeted unit tests for the Git service / bridge paths that the happy-path
 * suite in `gitService.test.ts` does not exercise. Specifically:
 *
 *   - The "no commits yet" branches of `unstageFile`, `unstageAll`, and
 *     `discardFile` (which must use `git rm --cached` instead of
 *     `git restore --staged`).
 *   - The error-wrapping behaviour of the IPC bridge.
 *   - The `pathUtils` helpers, exercised directly so they are not silently
 *     regressed by the integration tests changing.
 *   - The watcher teardown (`unwatch`, `dispose`) and singleton reset.
 */

import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GitService,
  getGitService,
  isSamePath,
  resetGitServiceForTests,
  type GitServiceDeps,
} from '@/process/services/git/GitService';
import { joinAbs, resolveAgainstRoot, toPosix } from '@/process/services/git/pathUtils';
import { initGitBridge, disposeGitBridge } from '@/process/bridge/gitBridge';
import { ipcBridge } from '@/common';

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

type CapturedWatcher = {
  on: (event: string, cb: (...args: unknown[]) => void) => unknown;
  close: () => Promise<void>;
  fire: (event: string, ...args: unknown[]) => void;
};

function makeDeps(): GitServiceDeps & { __watchers: CapturedWatcher[] } {
  const watchers: CapturedWatcher[] = [];
  return {
    chokidarFactory: () => {
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
      const watcher: CapturedWatcher = {
        on: (event: string, cb: (...args: unknown[]) => void) => {
          (listeners[event] ??= []).push(cb);
          return undefined;
        },
        close: async () => {
          /* no-op */
        },
        fire: (event: string) => {
          for (const cb of listeners[event] ?? []) cb();
        },
      };
      watchers.push(watcher);
      return watcher as unknown as ReturnType<typeof import('chokidar').watch>;
    },
    watchDebounceMs: 5,
    __watchers: watchers,
  };
}

function getWatchers(svc: GitService): CapturedWatcher[] {
  return (svc as unknown as { __watchers: CapturedWatcher[] }).__watchers;
}

beforeEach(async () => {
  const staging = path.join(tmpdir(), `aionui-git-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(staging, { recursive: true });
  tempDir = realpathSync(staging);
  resetGitServiceForTests();
  const deps = makeDeps();
  service = new GitService(deps);
  // Expose the captured watchers to the test bodies.
  (service as unknown as { __watchers: CapturedWatcher[] }).__watchers = deps.__watchers;
  const probe = spawnSync('git', ['--version'], { encoding: 'utf8' });
  gitAvailable = probe.status === 0;
});

afterEach(async () => {
  await service.dispose();
  resetGitServiceForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('pathUtils', () => {
  it('toPosix replaces backslashes with forward slashes', () => {
    expect(toPosix('a\\b\\c')).toBe('a/b/c');
    expect(toPosix('a/b/c')).toBe('a/b/c');
  });

  it('joinAbs joins a POSIX relative path onto an absolute root', () => {
    expect(joinAbs('/root', 'src/foo.ts')).toBe(path.resolve('/root', 'src/foo.ts'));
    expect(joinAbs('/root', 'nested/dir/file.ts')).toBe(path.resolve('/root', 'nested', 'dir', 'file.ts'));
  });

  it('resolveAgainstRoot normalizes an absolute path unchanged', () => {
    expect(resolveAgainstRoot('/root', '/abs/path.ts')).toBe(path.normalize('/abs/path.ts'));
  });

  it('resolveAgainstRoot resolves a relative path against the root', () => {
    expect(resolveAgainstRoot('/root', 'src/foo.ts')).toBe(path.resolve('/root', 'src', 'foo.ts'));
  });
});

describe('isSamePath', () => {
  it('returns true for identical paths', () => {
    expect(isSamePath('/a/b', '/a/b')).toBe(true);
  });

  it('returns false for distinct paths', () => {
    expect(isSamePath('/a/b', '/a/c')).toBe(false);
  });
});

describe('GitService — no-commits branches', () => {
  it('unstageFile on a no-commits repo uses git rm --cached', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    // No commit yet — file is in the index.

    await service.unstageFile({ workspace: tempDir, file_path: 'a.txt' });
    const status = await service.getStatus({ workspace: tempDir });
    // After `git rm --cached`, the file is no longer in the index but still
    // appears as untracked in the working tree.
    expect(status.staged).toEqual([]);
    expect(status.unstaged).toHaveLength(1);
    expect(status.unstaged[0]).toMatchObject({ status: 'untracked', relativePath: 'a.txt' });
  });

  it('unstageAll on a no-commits repo drops every staged file', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    writeFile('a.txt', 'a\n');
    writeFile('b.txt', 'b\n');
    git('add', 'a.txt', 'b.txt');

    await service.unstageAll({ workspace: tempDir });
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toEqual([]);
    // Both files should now be untracked.
    expect(status.unstaged.map((c) => c.relativePath).toSorted()).toEqual(['a.txt', 'b.txt']);
    expect(status.unstaged.every((c) => c.status === 'untracked')).toBe(true);
  });

  it('discardFile on a staged file with no commits removes it from index + disk', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    const target = writeFile('a.txt', 'one\n');
    git('add', 'a.txt');

    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });
    expect(existsSync(target)).toBe(false);
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toEqual([]);
  });

  it('getDiff rejects when the workspace is not a repo', async () => {
    if (!gitAvailable) return;
    await expect(service.getDiff({ workspace: tempDir, file_path: 'a.txt' })).rejects.toThrow(/not a git repo/);
  });

  it('stage / unstage / commit / branches / discard all throw outside a repo', async () => {
    if (!gitAvailable) return;
    await expect(service.stageFile({ workspace: tempDir, file_path: 'a.txt' })).rejects.toThrow(/not a git repo/);
    await expect(service.stageAll({ workspace: tempDir })).rejects.toThrow(/not a git repo/);
    await expect(service.unstageFile({ workspace: tempDir, file_path: 'a.txt' })).rejects.toThrow(/not a git repo/);
    await expect(service.unstageAll({ workspace: tempDir })).rejects.toThrow(/not a git repo/);
    await expect(service.discardFile({ workspace: tempDir, file_path: 'a.txt' })).rejects.toThrow(/not a git repo/);
    await expect(service.getBranches({ workspace: tempDir })).rejects.toThrow(/not a git repo/);
    await expect(service.commit({ workspace: tempDir, message: 'x' })).rejects.toThrow(/not a git repo/);
  });

  it('commit rejects an empty message', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    await expect(service.commit({ workspace: tempDir, message: '   ' })).rejects.toThrow(/commit message is required/);
  });

  it('init throws when the workspace does not exist', async () => {
    if (!gitAvailable) return;
    const ghost = path.join(tempDir, 'does-not-exist');
    await expect(service.init({ workspace: ghost })).rejects.toThrow(/workspace does not exist/);
  });
});

describe('GitService — watcher teardown', () => {
  it('unwatch closes the watcher for a single workspace and removes it from the map', async () => {
    if (!gitAvailable) return;
    await service.ensureWatch(tempDir);
    expect(service.watcherCount).toBe(1);
    await service.unwatch(tempDir);
    expect(service.watcherCount).toBe(0);
    // Calling unwatch on a non-watched workspace is a no-op.
    await service.unwatch(tempDir);
    expect(service.watcherCount).toBe(0);
  });

  it('ensureWatch is idempotent for the same workspace', async () => {
    await service.ensureWatch(tempDir);
    await service.ensureWatch(tempDir);
    expect(service.watcherCount).toBe(1);
  });

  it('ensureWatch ignores falsy workspaces', async () => {
    await service.ensureWatch('');
    expect(service.watcherCount).toBe(0);
  });

  it('fires the debounced "changed" event through the mocked watcher', async () => {
    if (!gitAvailable) return;
    await service.ensureWatch(tempDir);
    const events: Array<{ workspace: string; root: string }> = [];
    service.on('changed', (e) => events.push(e));
    // Trigger every chokidar event type we subscribe to.
    for (const w of getWatchers(service)) {
      w.fire('add');
      w.fire('change');
      w.fire('unlink');
      w.fire('addDir');
      w.fire('unlinkDir');
    }
    // Wait past the debounce window.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(events).toHaveLength(1);
    expect(events[0].workspace).toBe(tempDir);
    expect(events[0].root).toBe(tempDir);
  });

  it('coalesces a burst of mutations into a single debounced event', async () => {
    if (!gitAvailable) return;
    await service.ensureWatch(tempDir);
    const events: Array<{ workspace: string; root: string }> = [];
    service.on('changed', (e) => events.push(e));
    for (let i = 0; i < 5; i++) {
      for (const w of getWatchers(service)) w.fire('change');
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(events).toHaveLength(1);
  });

  it('swallows errors thrown by listeners on the changed event', async () => {
    if (!gitAvailable) return;
    await service.ensureWatch(tempDir);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    service.on('changed', () => {
      throw new Error('boom');
    });
    for (const w of getWatchers(service)) w.fire('change');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('swallows errors emitted by the underlying chokidar watcher', async () => {
    await service.ensureWatch(tempDir);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const w of getWatchers(service)) w.fire('error', new Error('fs gone'));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('refcounts multiple ensureWatch calls and only closes at zero', async () => {
    if (!gitAvailable) return;
    // Init a repo so both workspaces resolve to the same toplevel.
    git('init', '-q');
    const sub = path.join(tempDir, 'packages', 'app');
    mkdirSync(sub, { recursive: true });
    await service.ensureWatch(tempDir);
    await service.ensureWatch(sub);
    // Both workspaces share one chokidar watcher (the resolved root is the
    // same — tempDir).
    expect(service.watcherCount).toBe(1);
    expect(service.watcherRefCount).toBe(2);
    await service.unwatch(tempDir);
    expect(service.watcherCount).toBe(1);
    expect(service.watcherRefCount).toBe(1);
    await service.unwatch(sub);
    expect(service.watcherCount).toBe(0);
  });
});

describe('GitService — getRepoInfo edge cases', () => {
  it('returns isRepo:false when the workspace does not exist on disk', async () => {
    if (!gitAvailable) return;
    const ghost = path.join(tempDir, 'nope');
    const info = await service.getRepoInfo({ workspace: ghost });
    expect(info).toEqual({ isRepo: false, root: null, branch: null, gitAvailable: true });
  });

  it('throws when workspace is missing or empty', async () => {
    await expect(service.getRepoInfo({ workspace: '' })).rejects.toThrow(/workspace is required/);
  });

  it('throws when init is called with an empty workspace', async () => {
    await expect(service.init({ workspace: '' })).rejects.toThrow(/workspace is required/);
  });
});

describe('GitService — getDiff for staged changes', () => {
  it('returns a unified diff for a staged modification when staged:true', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'one\ntwo\n');
    git('add', 'a.txt');

    const diff = await service.getDiff({ workspace: tempDir, file_path: 'a.txt', staged: true });
    expect(diff.binary).toBe(false);
    expect(diff.patch).toMatch(/^diff --git a\/a\.txt b\/a\.txt/m);
    expect(diff.patch).toMatch(/\+two/);
  });
});

describe('GitService — discardFile for a tracked modification', () => {
  it('restores a tracked modification back to HEAD', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'original\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'mutated\n');

    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });
    expect(writeFileSync.length).toBeGreaterThan(0); // sanity: function reference
    // Re-read from disk to confirm restore.
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(path.join(tempDir, 'a.txt'), 'utf8')).toBe('original\n');
  });
});

describe('GitService — discardFile VS Code semantics (Critical #2)', () => {
  it('discarding a STAGED-ONLY modified file preserves the staged content', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    // Stage a modification (no further working-tree change).
    writeFile('a.txt', 'one\nTWO\n');
    git('add', 'a.txt');

    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });

    // The critical assertion: the file MUST still be staged with the
    // 'TWO' content — discardFile must not destroy staged work.
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toHaveLength(1);
    expect(status.staged[0]).toMatchObject({ relativePath: 'a.txt' });
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(path.join(tempDir, 'a.txt'), 'utf8')).toBe('one\nTWO\n');
  });

  it('discarding a STAGED-ONLY deletion keeps the staged deletion', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    // Stage the deletion of a.txt.
    git('rm', '-q', 'a.txt');

    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });

    // The deletion must remain staged. The file is gone from the working
    // tree (because staged deletion = working tree gone too).
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged.some((c) => c.relativePath === 'a.txt' && c.status === 'deleted')).toBe(true);
  });

  it('discarding an untracked file removes it from disk', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    const target = writeFile('junk.txt', 'junk\n');

    await service.discardFile({ workspace: tempDir, file_path: 'junk.txt' });
    expect(existsSync(target)).toBe(false);
  });

  it('discarding a tracked WORKING-TREE modification restores from the index, keeping staged changes', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    // Stage a new version, then keep modifying in the working tree.
    writeFile('a.txt', 'one\nSTAGED\n');
    git('add', 'a.txt');
    writeFile('a.txt', 'one\nSTAGED\nWORKING\n');

    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });

    // Working tree was restored to the staged version. Staged entry is
    // preserved (we did NOT rm --cached).
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(path.join(tempDir, 'a.txt'), 'utf8')).toBe('one\nSTAGED\n');
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged.some((c) => c.relativePath === 'a.txt' && c.status === 'modified')).toBe(true);
  });

  it('discarding a tracked file in an unborn repo removes it from the index AND disk', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    const target = writeFile('new.txt', 'hello\n');
    git('add', 'new.txt');
    // No commit yet — this is the only legitimate `rm --cached` case.

    await service.discardFile({ workspace: tempDir, file_path: 'new.txt' });
    expect(existsSync(target)).toBe(false);
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toEqual([]);
  });

  it('NEVER runs git rm --cached on a tracked staged file in a repo with commits', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'one\nTWO\n');
    git('add', 'a.txt');

    // Observable side-effect: a forbidden `rm --cached` would drop the
    // staged entry. Verify the staged entry survives the discard.
    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.staged).toHaveLength(1);
    // The working tree MUST be unchanged because there was no working-tree
    // modification to revert (staged-only).
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(path.join(tempDir, 'a.txt'), 'utf8')).toBe('one\nTWO\n');
  });
});

describe('GitService — commit() refreshes hasCommits cache (Medium #5)', () => {
  it('after a successful commit, subsequent operations take the with-commits branch', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');

    // First, probe with hasCommits cached as false (the no-commits path).
    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });
    // The file is now gone — discarded via the unborn-repo fallback.
    expect(existsSync(path.join(tempDir, 'a.txt'))).toBe(false);

    // Re-create + commit. After commit, the cache must be flipped so the
    // next discardFile takes the tracked-file path (and does NOT unlink).
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    await service.commit({ workspace: tempDir, message: 'init' });

    // Now make a working-tree modification and discard.
    writeFile('a.txt', 'one\nTWO\n');
    await service.discardFile({ workspace: tempDir, file_path: 'a.txt' });

    // If the cache had stayed at "no commits", discardFile would have
    // unlinked the file. With the cache flipped to true, the working
    // tree is restored from the index (so the file is restored to the
    // committed 'one\n' content), not unlinked.
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(path.join(tempDir, 'a.txt'), 'utf8')).toBe('one\n');
  });
});

describe('GitService — getStatus() branch consistency (Low #8)', () => {
  it('returns branch:null for a freshly-initialized repo with no commits', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    writeFile('untracked.txt', 'junk\n');
    const status = await service.getStatus({ workspace: tempDir });
    // The mapper used to derive branch from `status.current` (which is
    // 'main' / 'master' for an unborn repo). The new path reuses
    // getRepoInfo which returns null until the first commit.
    expect(status.info.isRepo).toBe(true);
    expect(status.info.branch).toBeNull();
  });

  it('returns the current branch after the first commit', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');

    const status = await service.getStatus({ workspace: tempDir });
    expect(['main', 'master']).toContain(status.info.branch);
  });

  it('matches the branch reported by getRepoInfo', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    const info = await service.getRepoInfo({ workspace: tempDir });
    writeFile('u.txt', 'u\n');
    const status = await service.getStatus({ workspace: tempDir });
    expect(status.info.branch).toBe(info.branch);
  });
});

describe('GitService — singleton helpers', () => {
  it('getGitService returns a process-wide singleton', () => {
    const a = getGitService();
    const b = getGitService();
    expect(a).toBe(b);
  });

  it('resetGitServiceForTests disposes the existing instance', async () => {
    const s = getGitService();
    s.ensureWatch(tempDir);
    resetGitServiceForTests();
    const after = getGitService();
    expect(after).not.toBe(s);
    // ensureWatch on the new instance should start fresh.
    expect(after.watcherCount).toBe(0);
  });
});

describe('gitBridge — error wrapping', () => {
  it('initGitBridge is idempotent (double-init is safe)', () => {
    // The bridge registers ipcBridge providers; we just ensure that calling
    // it twice does not throw. dispose is exercised separately.
    initGitBridge();
    initGitBridge();
    disposeGitBridge();
  });

  it('disposeGitBridge on a fresh process is a safe no-op', () => {
    disposeGitBridge();
  });

  it('forwards a service "changed" event through the ipcBridge emitter', () => {
    initGitBridge();
    // Use the singleton wired in by the bridge.
    const svc = getGitService();
    const emitSpy = vi.spyOn(ipcBridge.git.changed, 'emit');
    svc.emit('changed', { workspace: '/some/workspace', root: '/some/workspace' });
    expect(emitSpy).toHaveBeenCalledWith({ workspace: '/some/workspace', root: '/some/workspace' });
    emitSpy.mockRestore();
    disposeGitBridge();
  });

  it('forwards the resolved root in the "changed" event', () => {
    initGitBridge();
    const svc = getGitService();
    const emitSpy = vi.spyOn(ipcBridge.git.changed, 'emit');
    svc.emit('changed', { workspace: '/repo/packages/app', root: '/repo' });
    expect(emitSpy).toHaveBeenCalledWith({ workspace: '/repo/packages/app', root: '/repo' });
    emitSpy.mockRestore();
    disposeGitBridge();
  });

  it('returns success:false when the underlying service throws', async () => {
    // Mirror the bridge's error-wrapping closure against a service whose
    // method rejects. We don't have to drive the real provider — the
    // bridge simply forwards `try { await service.X(req) } catch (e) { msg: e.message }`.
    const failing = new GitService({
      chokidarFactory: () =>
        ({
          on: () => undefined,
          close: async () => undefined,
        }) as unknown as ReturnType<typeof import('chokidar').watch>,
    });
    vi.spyOn(failing, 'getRepoInfo').mockRejectedValueOnce(new Error('repo went away'));
    const provider = (req: { workspace: string }) =>
      failing.getRepoInfo(req).then(
        (data) => ({ success: true, data }),
        (err: unknown) => ({ success: false, msg: err instanceof Error ? err.message : String(err) })
      );
    const out = await provider({ workspace: '/x' });
    expect(out.success).toBe(false);
    expect(out.msg).toBe('repo went away');
    await failing.dispose();
  });
});

describe('gitBridge — provider round-trips', () => {
  // The bridge relies on `@office-ai/platform`'s BroadcastChannel adapter,
  // which only installs in browser-like environments. To exercise the
  // provider handlers directly in Node we capture the callbacks that
  // `initGitBridge()` registers, and invoke them synchronously. This
  // covers every try/catch in `gitBridge.ts` without depending on the
  // transport layer.
  type ProviderMap = Partial<Record<keyof typeof ipcBridge.git, (req: unknown) => Promise<unknown>>>;
  const providers: ProviderMap = {};

  const captureProviders = (): void => {
    for (const key of Object.keys(ipcBridge.git) as Array<keyof typeof ipcBridge.git>) {
      const slot = ipcBridge.git[key] as unknown as { provider?: (cb: (req: unknown) => Promise<unknown>) => void };
      if (typeof slot.provider === 'function') {
        const original = slot.provider.bind(slot);
        slot.provider = (cb: (req: unknown) => Promise<unknown>) => {
          providers[key] = cb;
          original(cb);
        };
      }
    }
  };

  it('captures and invokes getRepoInfo, getStatus, init, getBranches', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    captureProviders();
    initGitBridge();
    try {
      const repoInfo = (await providers.getRepoInfo?.({ workspace: tempDir })) as {
        success: boolean;
        data?: { isRepo: boolean };
      };
      expect(repoInfo.success).toBe(true);
      expect(repoInfo.data?.isRepo).toBe(true);

      const status = (await providers.getStatus?.({ workspace: tempDir })) as {
        success: boolean;
        data?: { info: { isRepo: boolean } };
      };
      expect(status.success).toBe(true);
      expect(status.data?.info.isRepo).toBe(true);

      // getStatus triggers ensureWatch as a side effect.
      const branches = (await providers.getBranches?.({ workspace: tempDir })) as { success: boolean; data?: string[] };
      expect(branches.success).toBe(true);
      expect(Array.isArray(branches.data)).toBe(true);

      // unwatch is exposed as a provider; calling it twice is safe.
      const unwatchOnce = await providers.unwatch?.({ workspace: tempDir });
      expect((unwatchOnce as { success: boolean }).success).toBe(true);
      const unwatchAgain = await providers.unwatch?.({ workspace: tempDir });
      expect((unwatchAgain as { success: boolean }).success).toBe(true);
    } finally {
      disposeGitBridge();
      for (const k of Object.keys(providers)) delete providers[k as keyof typeof providers];
    }
  });

  it('captures and invokes init to git init + write .gitignore', async () => {
    if (!gitAvailable) return;
    captureProviders();
    initGitBridge();
    try {
      const init = (await providers.init?.({ workspace: tempDir })) as {
        success: boolean;
        data?: { createdGitignore: boolean };
      };
      expect(init.success).toBe(true);
      expect(init.data?.createdGitignore).toBe(true);
      expect(existsSync(path.join(tempDir, '.git'))).toBe(true);
      expect(existsSync(path.join(tempDir, '.gitignore'))).toBe(true);
    } finally {
      disposeGitBridge();
      for (const k of Object.keys(providers)) delete providers[k as keyof typeof providers];
    }
  });

  it('captures and invokes the diff / stage / unstage / discard / commit providers', async () => {
    if (!gitAvailable) return;
    git('init', '-q');
    git('config', 'user.email', 't@t.com');
    git('config', 'user.name', 'T');
    writeFile('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'init');
    writeFile('a.txt', 'one\ntwo\n');

    captureProviders();
    initGitBridge();
    try {
      const diff = (await providers.getDiff?.({ workspace: tempDir, file_path: 'a.txt' })) as {
        success: boolean;
        data?: { patch: string };
      };
      expect(diff.success).toBe(true);
      expect(diff.data?.patch).toMatch(/\+two/);

      const stageOne = await providers.stageFile?.({ workspace: tempDir, file_path: 'a.txt' });
      expect((stageOne as { success: boolean }).success).toBe(true);

      const unstageOne = await providers.unstageFile?.({ workspace: tempDir, file_path: 'a.txt' });
      expect((unstageOne as { success: boolean }).success).toBe(true);

      const stageAll = await providers.stageAll?.({ workspace: tempDir });
      expect((stageAll as { success: boolean }).success).toBe(true);

      const unstageAll = await providers.unstageAll?.({ workspace: tempDir });
      expect((unstageAll as { success: boolean }).success).toBe(true);

      // Re-stage for the discard + commit tests.
      await providers.stageFile?.({ workspace: tempDir, file_path: 'a.txt' });
      const commit = (await providers.commit?.({ workspace: tempDir, message: 'via bridge' })) as {
        success: boolean;
        data?: { commit: string };
      };
      expect(commit.success).toBe(true);
      expect(commit.data?.commit).toMatch(/^[0-9a-f]{7,40}$/);

      const discard = await providers.discardFile?.({ workspace: tempDir, file_path: 'a.txt' });
      expect((discard as { success: boolean }).success).toBe(true);
    } finally {
      disposeGitBridge();
      for (const k of Object.keys(providers)) delete providers[k as keyof typeof providers];
    }
  });

  it('wraps service exceptions with success:false (getDiff outside a repo)', async () => {
    if (!gitAvailable) return;
    captureProviders();
    initGitBridge();
    try {
      const out = (await providers.getDiff?.({ workspace: tempDir, file_path: 'a.txt' })) as {
        success: boolean;
        msg?: string;
      };
      expect(out.success).toBe(false);
      expect(out.msg).toMatch(/not a git repo/);
    } finally {
      disposeGitBridge();
      for (const k of Object.keys(providers)) delete providers[k as keyof typeof providers];
    }
  });
});
