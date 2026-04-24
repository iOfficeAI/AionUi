/**
 * E2E: Workspace Snapshot / Changes tab — git-backed staging pipeline.
 *
 * Drives `/api/fs/snapshot/*` via invokeBridge against a temp workspace,
 * validating the backend contract used by the workspace "Changes" tab:
 * init → write → compare → stage/unstage → discard. All calls go through
 * the shared HTTP bridge in `helpers/bridge.ts` (--local mode, no auth).
 */
import { test, expect } from '../../fixtures';
import { invokeBridge } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

type FileChangeOperation = 'create' | 'modify' | 'delete';

type FileChangeInfo = {
  filePath: string;
  relativePath: string;
  operation: FileChangeOperation;
};

type CompareResult = {
  staged: FileChangeInfo[];
  unstaged: FileChangeInfo[];
};

type SnapshotInfo = {
  mode: 'git-repo' | 'snapshot';
  branch: string | null;
};

function normalizeRel(p: string): string {
  return p.split('\\').join('/');
}

test.describe('Workspace Snapshot — backend API', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-snap-'));
    // Seed one committed-like baseline file so subsequent writes register as diffs.
    fs.writeFileSync(path.join(workspace, 'baseline.txt'), 'original');
  });

  test.afterAll(async ({ page }, testInfo) => {
    // Best-effort dispose to release any git/worktree handles the backend holds.
    try {
      await invokeBridge(page, 'fs.snapshot.dispose', { workspace });
    } catch {
      // ignore — cleanup only
    }
    fs.rmSync(workspace, { recursive: true, force: true });
    void testInfo;
  });

  test('snapshot.init reports a mode and (optional) branch', async ({ page }) => {
    const info = await invokeBridge<SnapshotInfo>(page, 'fs.snapshot.init', { workspace });
    expect(info).toBeTruthy();
    expect(['git-repo', 'snapshot']).toContain(info.mode);
    // branch is null for regular-dir snapshots; string for git-repo.
    expect(info.branch === null || typeof info.branch === 'string').toBe(true);
  });

  test('write new file → compare surfaces the change as unstaged create', async ({ page }) => {
    const target = path.join(workspace, 'created.txt');
    await invokeBridge(page, 'fs.write', { path: target, data: 'hello-snapshot' });

    const diff = await invokeBridge<CompareResult>(page, 'fs.snapshot.compare', { workspace });
    const unstagedRel = diff.unstaged.map((f) => normalizeRel(f.relativePath));
    expect(unstagedRel).toContain('created.txt');

    const entry = diff.unstaged.find((f) => normalizeRel(f.relativePath) === 'created.txt');
    expect(entry?.operation).toBe('create');
  });

  test('stage file moves it from unstaged → staged', async ({ page }) => {
    await invokeBridge(page, 'fs.snapshot.stage', { workspace, file_path: 'created.txt' });

    const diff = await invokeBridge<CompareResult>(page, 'fs.snapshot.compare', { workspace });
    const stagedRel = diff.staged.map((f) => normalizeRel(f.relativePath));
    const unstagedRel = diff.unstaged.map((f) => normalizeRel(f.relativePath));
    expect(stagedRel).toContain('created.txt');
    expect(unstagedRel).not.toContain('created.txt');
  });

  test('unstage file moves it back to unstaged', async ({ page }) => {
    await invokeBridge(page, 'fs.snapshot.unstage', { workspace, file_path: 'created.txt' });

    const diff = await invokeBridge<CompareResult>(page, 'fs.snapshot.compare', { workspace });
    const stagedRel = diff.staged.map((f) => normalizeRel(f.relativePath));
    const unstagedRel = diff.unstaged.map((f) => normalizeRel(f.relativePath));
    expect(stagedRel).not.toContain('created.txt');
    expect(unstagedRel).toContain('created.txt');
  });

  test('discard removes a created file and clears it from compare', async ({ page }) => {
    await invokeBridge(page, 'fs.snapshot.discard', {
      workspace,
      file_path: 'created.txt',
      operation: 'create',
    });

    const diff = await invokeBridge<CompareResult>(page, 'fs.snapshot.compare', { workspace });
    const allRel = [...diff.staged, ...diff.unstaged].map((f) => normalizeRel(f.relativePath));
    expect(allRel).not.toContain('created.txt');
    // For an "added" file, discard = unlink on disk.
    expect(fs.existsSync(path.join(workspace, 'created.txt'))).toBe(false);
  });

  test('stage-all / unstage-all operate on every pending change', async ({ page }) => {
    await invokeBridge(page, 'fs.write', { path: path.join(workspace, 'bulk-1.txt'), data: '1' });
    await invokeBridge(page, 'fs.write', { path: path.join(workspace, 'bulk-2.txt'), data: '2' });

    await invokeBridge(page, 'fs.snapshot.stage-all', { workspace });
    let diff = await invokeBridge<CompareResult>(page, 'fs.snapshot.compare', { workspace });
    const stagedAfterAll = diff.staged.map((f) => normalizeRel(f.relativePath));
    expect(stagedAfterAll).toEqual(expect.arrayContaining(['bulk-1.txt', 'bulk-2.txt']));

    await invokeBridge(page, 'fs.snapshot.unstage-all', { workspace });
    diff = await invokeBridge<CompareResult>(page, 'fs.snapshot.compare', { workspace });
    const unstagedAfterAll = diff.unstaged.map((f) => normalizeRel(f.relativePath));
    expect(unstagedAfterAll).toEqual(expect.arrayContaining(['bulk-1.txt', 'bulk-2.txt']));
    expect(diff.staged.map((f) => normalizeRel(f.relativePath))).not.toContain('bulk-1.txt');
  });
});
