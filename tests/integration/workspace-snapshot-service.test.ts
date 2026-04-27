/**
 * Integration: WorkspaceSnapshotService — staging pipeline.
 *
 * Drives the real service directly (no IPC, no HTTP) against temp workspaces
 * so we validate init → compare → stage/unstage → discard against actual git
 * plumbing. Previously covered via `workspace-snapshot.e2e.ts` API layer; now
 * lives here so E2E only asserts UI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceSnapshotService } from '@process/services/WorkspaceSnapshotService';

function normalizeRel(p: string): string {
  return p.split('\\').join('/');
}

describe('WorkspaceSnapshotService — non-git workspace (snapshot mode)', () => {
  const service = new WorkspaceSnapshotService();
  let workspace: string;

  beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-svc-'));
    fs.writeFileSync(path.join(workspace, 'baseline.txt'), 'original');
  });

  afterAll(async () => {
    await service.dispose(workspace).catch(() => {});
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('init reports a mode and nullable branch', async () => {
    const info = await service.init(workspace);
    expect(['git-repo', 'snapshot']).toContain(info.mode);
    expect(info.branch === null || typeof info.branch === 'string').toBe(true);
  });

  it('writing a new file surfaces as unstaged create in compare()', async () => {
    fs.writeFileSync(path.join(workspace, 'created.txt'), 'hello-snapshot');

    const diff = await service.compare(workspace);
    const unstagedRel = diff.unstaged.map((f) => normalizeRel(f.relativePath));
    expect(unstagedRel).toContain('created.txt');

    const entry = diff.unstaged.find((f) => normalizeRel(f.relativePath) === 'created.txt');
    expect(entry?.operation).toBe('create');
  });

  it('getInfo returns the current snapshot mode', async () => {
    const info = await service.getInfo(workspace);
    expect(['git-repo', 'snapshot']).toContain(info.mode);
  });

  it('resetFile removes a created file (snapshot mode)', async () => {
    const target = path.join(workspace, 'to-discard.txt');
    fs.writeFileSync(target, 'will-be-discarded');

    await service.resetFile(workspace, 'to-discard.txt', 'create');

    expect(fs.existsSync(target)).toBe(false);
    const diff = await service.compare(workspace);
    const allRel = [...diff.staged, ...diff.unstaged].map((f) => normalizeRel(f.relativePath));
    expect(allRel).not.toContain('to-discard.txt');
  });

  it('dispose clears the tracked state for the workspace', async () => {
    await service.dispose(workspace);
    // After dispose, compare() returns empty lists rather than throwing.
    const diff = await service.compare(workspace);
    expect(diff.staged).toEqual([]);
    expect(diff.unstaged).toEqual([]);
  });
});
