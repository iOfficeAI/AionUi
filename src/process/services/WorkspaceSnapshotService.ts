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
import type { CompareResult, FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';

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

  async compare(workspacePath: string): Promise<CompareResult> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return { staged: [], unstaged: [] };
    }

    if (state.mode === 'git-repo') {
      return this.compareGitRepo(workspacePath);
    }
    return this.compareSnapshot(state);
  }

  async getBaselineContent(workspacePath: string, filePath: string): Promise<string | null> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return null;
    }

    try {
      const gitArgs = state.mode === 'git-repo' ? [] : this.gitArgs(state);
      const { stdout } = await execFileAsync('git', [...gitArgs, 'show', `HEAD:${filePath}`], {
        cwd: workspacePath,
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf-8',
      });
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

  // --- Branch operations (git-repo mode only) ---

  async getBranches(workspacePath: string): Promise<string[]> {
    this.ensureGitRepo(workspacePath);
    const { stdout } = await execFileAsync('git', ['branch', '--format=%(refname:short)'], { cwd: workspacePath });
    return stdout
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);
  }

  // --- Git operations (git-repo mode only) ---

  async stageFile(workspacePath: string, filePath: string): Promise<void> {
    this.ensureGitRepo(workspacePath);
    await execFileAsync('git', ['add', '--', filePath], { cwd: workspacePath });
  }

  async stageAll(workspacePath: string): Promise<void> {
    this.ensureGitRepo(workspacePath);
    await execFileAsync('git', ['add', '-A'], { cwd: workspacePath });
  }

  async unstageFile(workspacePath: string, filePath: string): Promise<void> {
    this.ensureGitRepo(workspacePath);
    await execFileAsync('git', ['restore', '--staged', '--', filePath], { cwd: workspacePath });
  }

  async unstageAll(workspacePath: string): Promise<void> {
    this.ensureGitRepo(workspacePath);
    await execFileAsync('git', ['restore', '--staged', '.'], { cwd: workspacePath });
  }

  async discardFile(workspacePath: string, filePath: string, operation: FileChangeInfo['operation']): Promise<void> {
    this.ensureGitRepo(workspacePath);

    if (operation === 'create') {
      // Untracked file — delete it
      const fullPath = path.join(workspacePath, filePath);
      await fs.unlink(fullPath).catch(() => {});
    } else {
      // Modified or deleted — restore from HEAD
      await execFileAsync('git', ['checkout', 'HEAD', '--', filePath], { cwd: workspacePath });
    }
  }

  // --- Snapshot mode reset ---

  async resetFile(workspacePath: string, filePath: string, operation: FileChangeInfo['operation']): Promise<void> {
    const state = this.snapshots.get(workspacePath);
    if (!state || state.mode !== 'snapshot') return;

    const fullPath = path.join(workspacePath, filePath);

    if (operation === 'create') {
      await fs.unlink(fullPath).catch(() => {});
    } else {
      const content = await this.getBaselineContent(workspacePath, filePath);
      if (content !== null) {
        await fs.mkdir(path.dirname(fullPath), { recursive: true }).catch(() => {});
        await fs.writeFile(fullPath, content, 'utf-8');
      }
    }
  }

  // --- Lifecycle ---

  async dispose(workspacePath: string): Promise<void> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return;
    }

    // Only snapshot mode uses a temp gitdir that needs cleanup
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

  // --- Private ---

  private gitArgs(state: SnapshotState): string[] {
    return [`--git-dir=${state.gitdir}`, `--work-tree=${state.workspacePath}`];
  }

  private ensureGitRepo(workspacePath: string): void {
    const state = this.snapshots.get(workspacePath);
    if (!state || state.mode !== 'git-repo') {
      throw new Error('Git operations are only available in git-repo mode');
    }
  }

  private async detectMode(workspacePath: string): Promise<'git-repo' | 'snapshot'> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: workspacePath });
      return 'git-repo';
    } catch {
      return 'snapshot';
    }
  }

  private async initGitRepo(workspacePath: string): Promise<SnapshotInfo> {
    const gitdir = path.join(workspacePath, '.git');

    let branch: string | null = null;
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspacePath });
      branch = stdout.trim() || null;
    } catch {
      // Detached HEAD or empty repo
    }

    let baselineRef = 'HEAD';
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workspacePath });
      baselineRef = stdout.trim();
    } catch {
      // Empty repo with no commits
    }

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
      { cwd: workspacePath }
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

  /** Parse `git status --porcelain` for git-repo mode → staged + unstaged */
  private async compareGitRepo(workspacePath: string): Promise<CompareResult> {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: workspacePath,
      maxBuffer: 10 * 1024 * 1024,
    });

    const staged: FileChangeInfo[] = [];
    const unstaged: FileChangeInfo[] = [];

    for (const line of stdout.split('\n')) {
      if (!line) continue;

      const x = line[0]; // staging area status
      const y = line[1]; // working tree status
      const filepath = line.slice(3);

      const makeInfo = (op: FileChangeInfo['operation']): FileChangeInfo => ({
        relativePath: filepath,
        filePath: path.join(workspacePath, filepath),
        operation: op,
      });

      // Staged changes (X column)
      if (x === 'M') staged.push(makeInfo('modify'));
      else if (x === 'A') staged.push(makeInfo('create'));
      else if (x === 'D') staged.push(makeInfo('delete'));
      else if (x === 'R') staged.push(makeInfo('modify'));

      // Unstaged changes (Y column)
      if (y === 'M') unstaged.push(makeInfo('modify'));
      else if (y === 'D') unstaged.push(makeInfo('delete'));

      // Untracked files
      if (x === '?' && y === '?') unstaged.push(makeInfo('create'));
    }

    return { staged, unstaged };
  }

  /** Compare snapshot mode — all changes go to unstaged (no staging concept) */
  private async compareSnapshot(state: SnapshotState): Promise<CompareResult> {
    const gitArgs = this.gitArgs(state);
    const changes: FileChangeInfo[] = [];

    const { stdout: diffOut } = await execFileAsync('git', [...gitArgs, 'diff', '--name-status', state.baselineRef], {
      cwd: state.workspacePath,
      maxBuffer: 10 * 1024 * 1024,
    });

    for (const line of diffOut.split('\n')) {
      if (!line) continue;
      const status = line[0];
      const filepath = line.slice(2);
      if (status === 'M') {
        changes.push({
          relativePath: filepath,
          filePath: path.join(state.workspacePath, filepath),
          operation: 'modify',
        });
      } else if (status === 'D') {
        changes.push({
          relativePath: filepath,
          filePath: path.join(state.workspacePath, filepath),
          operation: 'delete',
        });
      } else if (status === 'A') {
        changes.push({
          relativePath: filepath,
          filePath: path.join(state.workspacePath, filepath),
          operation: 'create',
        });
      }
    }

    const { stdout: untrackedOut } = await execFileAsync(
      'git',
      [...gitArgs, 'ls-files', '--others', '--exclude-standard'],
      { cwd: state.workspacePath, maxBuffer: 10 * 1024 * 1024 }
    );

    for (const filepath of untrackedOut.split('\n')) {
      if (!filepath) continue;
      changes.push({ relativePath: filepath, filePath: path.join(state.workspacePath, filepath), operation: 'create' });
    }

    return { staged: [], unstaged: changes };
  }

  private async createWorkingTreeSnapshot(workspacePath: string): Promise<string> {
    const gitdir = path.join(os.tmpdir(), `aionui-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const gitArgs = [`--git-dir=${gitdir}`, `--work-tree=${workspacePath}`];

    await execFileAsync('git', ['init', '--bare', gitdir]);
    await execFileAsync('git', [...gitArgs, 'add', '.'], { cwd: workspacePath });
    await execFileAsync(
      'git',
      [
        ...gitArgs,
        '-c',
        'user.name=AionUI',
        '-c',
        'user.email=snapshot@aionui.local',
        'commit',
        '--allow-empty',
        '-m',
        'baseline',
      ],
      { cwd: workspacePath }
    );

    return gitdir;
  }
}
