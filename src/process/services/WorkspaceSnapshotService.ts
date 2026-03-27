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

    // git diff --name-status against baseline, plus untracked files
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

    // Untracked files (new files not in baseline)
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

    if (state.mode === 'snapshot') {
      await fs.rm(state.gitdir, { recursive: true, force: true }).catch(() => {});
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

  /** Build --git-dir / --work-tree args for snapshot mode, empty for git-repo mode */
  private gitArgs(state: SnapshotState): string[] {
    if (state.mode === 'git-repo') return [];
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
    const gitdir = path.join(workspacePath, '.git');

    const { stdout: branchOut } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: workspacePath },
    );
    const branch = branchOut.trim() || null;

    const { stdout: oidOut } = await execFileAsync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: workspacePath },
    );
    const baselineRef = oidOut.trim();

    this.snapshots.set(workspacePath, {
      mode: 'git-repo',
      workspacePath,
      gitdir,
      baselineRef,
      branch,
    });

    return { mode: 'git-repo', branch };
  }

  private async initSnapshot(workspacePath: string): Promise<SnapshotInfo> {
    const gitdir = path.join(os.tmpdir(), `aionui-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const gitArgs = [`--git-dir=${gitdir}`, `--work-tree=${workspacePath}`];

    // Create default .gitignore if none exists
    const gitignorePath = path.join(workspacePath, '.gitignore');
    let createdGitignore = false;
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf-8');
      createdGitignore = true;
    }

    await execFileAsync('git', ['init', '--bare', gitdir]);
    await execFileAsync('git', [...gitArgs, 'add', '.'], { cwd: workspacePath });
    await execFileAsync(
      'git',
      [...gitArgs, '-c', 'user.name=AionUI', '-c', 'user.email=snapshot@aionui.local', 'commit', '-m', 'baseline'],
      { cwd: workspacePath },
    );

    const { stdout: oidOut } = await execFileAsync('git', [...gitArgs, 'rev-parse', 'HEAD'], { cwd: workspacePath });
    const baselineRef = oidOut.trim();

    this.snapshots.set(workspacePath, {
      mode: 'snapshot',
      workspacePath,
      gitdir,
      baselineRef,
      branch: null,
      createdGitignore,
    });

    return { mode: 'snapshot', branch: null };
  }
}
