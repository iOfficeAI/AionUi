/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';

const execFileAsync = promisify(execFile);

type SnapshotState = {
  mode: 'git-repo' | 'snapshot';
  workspacePath: string;
  gitdir: string;
  baselineRef: string;
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

    const gitArgs = this.gitArgs(state);
    const changes: FileChangeInfo[] = [];

    // Tracked changes: modified + deleted
    const { stdout: diffOut } = await execFileAsync(
      'git',
      [...gitArgs, 'diff', '--name-status', state.baselineRef],
      { cwd: workspacePath, maxBuffer: 10 * 1024 * 1024 },
    );

    for (const line of diffOut.split('\n')) {
      if (!line) continue;
      const status = line[0];
      const filepath = line.slice(2);
      if (status === 'M') {
        changes.push({ relativePath: filepath, filePath: path.join(workspacePath, filepath), operation: 'modify' });
      } else if (status === 'D') {
        changes.push({ relativePath: filepath, filePath: path.join(workspacePath, filepath), operation: 'delete' });
      } else if (status === 'A') {
        changes.push({ relativePath: filepath, filePath: path.join(workspacePath, filepath), operation: 'create' });
      }
    }

    // Untracked files (new files not in baseline snapshot)
    const { stdout: untrackedOut } = await execFileAsync(
      'git',
      [...gitArgs, 'ls-files', '--others', '--exclude-standard'],
      { cwd: workspacePath, maxBuffer: 10 * 1024 * 1024 },
    );

    for (const filepath of untrackedOut.split('\n')) {
      if (!filepath) continue;
      changes.push({ relativePath: filepath, filePath: path.join(workspacePath, filepath), operation: 'create' });
    }

    return changes;
  }

  async getBaselineContent(workspacePath: string, filePath: string): Promise<string | null> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return null;
    }

    try {
      const gitArgs = this.gitArgs(state);
      const { stdout } = await execFileAsync(
        'git',
        [...gitArgs, 'show', `${state.baselineRef}:${filePath}`],
        { cwd: workspacePath, maxBuffer: 50 * 1024 * 1024, encoding: 'utf-8' },
      );
      return stdout;
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

    // Both modes use a temp gitdir that needs cleanup
    await fs.rm(state.gitdir, { recursive: true, force: true }).catch(() => {});

    if (state.createdGitignore) {
      await fs.unlink(path.join(state.workspacePath, '.gitignore')).catch(() => {});
    }

    this.snapshots.delete(workspacePath);
  }

  async disposeAll(): Promise<void> {
    const workspaces = Array.from(this.snapshots.keys());
    await Promise.all(workspaces.map((ws) => this.dispose(ws)));
  }

  private gitArgs(state: SnapshotState): string[] {
    return [`--git-dir=${state.gitdir}`, `--work-tree=${state.workspacePath}`];
  }

  private async detectMode(workspacePath: string): Promise<'git-repo' | 'snapshot'> {
    try {
      const gitPath = path.join(workspacePath, '.git');
      const stat = await fs.stat(gitPath);
      return stat.isDirectory() ? 'git-repo' : 'snapshot';
    } catch {
      return 'snapshot';
    }
  }

  private async initGitRepo(workspacePath: string): Promise<SnapshotInfo> {
    // Read branch name from the real .git
    let branch: string | null = null;
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: workspacePath },
      );
      branch = stdout.trim() || null;
    } catch {
      // Detached HEAD or other edge cases
    }

    // Create temp gitdir to snapshot current working tree state
    // so we only show changes made DURING this conversation
    const gitdir = await this.createWorkingTreeSnapshot(workspacePath);

    const { stdout: oidOut } = await execFileAsync(
      'git',
      [`--git-dir=${gitdir}`, `--work-tree=${workspacePath}`, 'rev-parse', 'HEAD'],
      { cwd: workspacePath },
    );

    this.snapshots.set(workspacePath, {
      mode: 'git-repo',
      workspacePath,
      gitdir,
      baselineRef: oidOut.trim(),
      branch,
    });

    return { mode: 'git-repo', branch };
  }

  private async initSnapshot(workspacePath: string): Promise<SnapshotInfo> {
    // Create default .gitignore if none exists
    const gitignorePath = path.join(workspacePath, '.gitignore');
    let createdGitignore = false;
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf-8');
      createdGitignore = true;
    }

    const gitdir = await this.createWorkingTreeSnapshot(workspacePath);

    const { stdout: oidOut } = await execFileAsync(
      'git',
      [`--git-dir=${gitdir}`, `--work-tree=${workspacePath}`, 'rev-parse', 'HEAD'],
      { cwd: workspacePath },
    );

    this.snapshots.set(workspacePath, {
      mode: 'snapshot',
      workspacePath,
      gitdir,
      baselineRef: oidOut.trim(),
      branch: null,
      createdGitignore,
    });

    return { mode: 'snapshot', branch: null };
  }

  /** Create a temp bare repo and commit the current working tree state as baseline */
  private async createWorkingTreeSnapshot(workspacePath: string): Promise<string> {
    const gitdir = path.join(os.tmpdir(), `aionui-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const gitArgs = [`--git-dir=${gitdir}`, `--work-tree=${workspacePath}`];

    await execFileAsync('git', ['init', '--bare', gitdir]);
    await execFileAsync('git', [...gitArgs, 'add', '.'], { cwd: workspacePath });
    await execFileAsync(
      'git',
      [...gitArgs, '-c', 'user.name=AionUI', '-c', 'user.email=snapshot@aionui.local', 'commit', '-m', 'baseline'],
      { cwd: workspacePath },
    );

    return gitdir;
  }
}
