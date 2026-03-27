/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import git from 'isomorphic-git';
import crypto from 'node:crypto';
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

function hashBuffer(buf: Uint8Array): string {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

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

    // Use git.walk with content hashing to avoid the "racy git" problem
    // (statusMatrix uses stat-based caching which misses rapid modifications)
    const changes: FileChangeInfo[] = [];

    await git.walk({
      fs: nodeFs,
      dir: workspacePath,
      gitdir: state.gitdir,
      trees: [git.TREE({ ref: 'HEAD' }), git.WORKDIR()],
      map: async (filepath, [head, workdir]) => {
        // Skip .git directory
        if (filepath.startsWith('.git')) return null;

        const headType = head ? await head.type() : null;
        const workdirType = workdir ? await workdir.type() : null;

        // Continue walking into directories
        if (headType === 'tree' || workdirType === 'tree') return filepath;

        if (!head && workdir) {
          // Skip files that match .gitignore rules (WORKDIR walker doesn't filter them)
          const ignored = await git.isIgnored({
            fs: nodeFs,
            dir: workspacePath,
            gitdir: state.gitdir,
            filepath,
          });
          if (ignored) return filepath;

          changes.push({
            relativePath: filepath,
            filePath: path.join(workspacePath, filepath),
            operation: 'create',
          });
        } else if (head && !workdir) {
          changes.push({
            relativePath: filepath,
            filePath: path.join(workspacePath, filepath),
            operation: 'delete',
          });
        } else if (head && workdir) {
          const headContent = await head.content();
          const workdirContent = await workdir.content();
          if (headContent && workdirContent && hashBuffer(headContent) !== hashBuffer(workdirContent)) {
            changes.push({
              relativePath: filepath,
              filePath: path.join(workspacePath, filepath),
              operation: 'modify',
            });
          }
        }

        return filepath;
      },
    });

    return changes;
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
