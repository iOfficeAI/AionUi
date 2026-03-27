/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import git from 'isomorphic-git';
import nodeFs from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';

type SnapshotState = {
  mode: 'git-repo' | 'snapshot';
  workspacePath: string;
  gitdir: string;
  baselineOid: string;
  branch: string | null;
  createdGitignore?: boolean;
};

const DEFAULT_GITIGNORE = `node_modules/
.git/
*.lock
`;

export class WorkspaceSnapshotService {
  private snapshots = new Map<string, SnapshotState>();

  async init(workspacePath: string): Promise<SnapshotInfo> {
    // Dispose existing snapshot if re-initializing
    if (this.snapshots.has(workspacePath)) {
      await this.dispose(workspacePath);
    }

    const mode = await this.detectMode(workspacePath);

    if (mode === 'git-repo') {
      return this.initGitRepo(workspacePath);
    }
    return this.initSnapshot(workspacePath);
  }

  async compare(workspacePath: string): Promise<FileChangeInfo[]> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return [];
    }

    // statusMatrix is stat-based (O(n) stat calls, no file content reads)
    // Much faster and memory-efficient than git.walk with content hashing
    const matrix = await git.statusMatrix({
      fs: nodeFs,
      dir: workspacePath,
      gitdir: state.gitdir,
    });

    // statusMatrix returns: [filepath, HEAD, WORKDIR, STAGE]
    // HEAD=0 means file not in baseline, HEAD=1 means file in baseline
    // WORKDIR=0 means deleted, WORKDIR=2 means exists (new or modified)
    return matrix
      .filter(([, head, workdir]) => head !== workdir)
      .map(([filepath, head, workdir]) => ({
        relativePath: filepath as string,
        filePath: path.join(workspacePath, filepath as string),
        operation: head === 0 ? ('create' as const) : workdir === 0 ? ('delete' as const) : ('modify' as const),
      }));
  }

  async getBaselineContent(workspacePath: string, filePath: string): Promise<string | null> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return null;
    }

    try {
      const { blob } = await git.readBlob({
        fs: nodeFs,
        dir: workspacePath,
        gitdir: state.gitdir,
        oid: state.baselineOid,
        filepath: filePath,
      });
      return new TextDecoder().decode(blob);
    } catch {
      return null;
    }
  }

  async getInfo(workspacePath: string): Promise<SnapshotInfo> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return { mode: 'snapshot', branch: null };
    }
    return { mode: state.mode, branch: state.branch };
  }

  async dispose(workspacePath: string): Promise<void> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return;
    }

    if (state.mode === 'snapshot') {
      // Clean up temp gitdir
      await fs.rm(state.gitdir, { recursive: true, force: true }).catch(() => {});
      // Clean up .gitignore we created
      if (state.createdGitignore) {
        await fs.unlink(path.join(state.workspacePath, '.gitignore')).catch(() => {});
      }
    }

    this.snapshots.delete(workspacePath);
  }

  async disposeAll(): Promise<void> {
    const workspaces = Array.from(this.snapshots.keys());
    await Promise.all(workspaces.map((ws) => this.dispose(ws)));
  }

  private async detectMode(workspacePath: string): Promise<'git-repo' | 'snapshot'> {
    try {
      const gitPath = path.join(workspacePath, '.git');
      const stat = await fs.stat(gitPath);
      // Only treat as git-repo if .git is a directory (not a file like worktree/submodule)
      return stat.isDirectory() ? 'git-repo' : 'snapshot';
    } catch {
      return 'snapshot';
    }
  }

  private async initGitRepo(workspacePath: string): Promise<SnapshotInfo> {
    const gitdir = path.join(workspacePath, '.git');
    const branch: string | null = (await git.currentBranch({ fs: nodeFs, dir: workspacePath, gitdir })) || null;

    const commits = await git.log({ fs: nodeFs, dir: workspacePath, gitdir, depth: 1 });
    const baselineOid = commits[0]?.oid ?? '';

    this.snapshots.set(workspacePath, {
      mode: 'git-repo',
      workspacePath,
      gitdir,
      baselineOid,
      branch,
    });

    return { mode: 'git-repo', branch };
  }

  private async initSnapshot(workspacePath: string): Promise<SnapshotInfo> {
    const gitdir = path.join(os.tmpdir(), `aionui-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    // Create default .gitignore if none exists
    const gitignorePath = path.join(workspacePath, '.gitignore');
    let createdGitignore = false;
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf-8');
      createdGitignore = true;
    }

    await git.init({ fs: nodeFs, dir: workspacePath, gitdir });
    await git.add({ fs: nodeFs, dir: workspacePath, gitdir, filepath: '.' });
    const baselineOid = await git.commit({
      fs: nodeFs,
      dir: workspacePath,
      gitdir,
      message: 'baseline',
      author: { name: 'AionUI', email: 'snapshot@aionui.local' },
    });

    this.snapshots.set(workspacePath, {
      mode: 'snapshot',
      workspacePath,
      gitdir,
      baselineOid,
      branch: null,
      createdGitignore,
    });

    return { mode: 'snapshot', branch: null };
  }
}
