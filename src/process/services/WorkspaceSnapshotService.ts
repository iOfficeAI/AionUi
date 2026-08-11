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
const SNAPSHOT_TEMP_PREFIX = 'aionui-snapshot-';

type SnapshotState = {
  mode: 'git-repo';
  workspacePath: string;
  branch: string | null;
};

export class WorkspaceSnapshotService {
  private snapshots = new Map<string, SnapshotState>();
  private lifecycleVersions = new Map<string, number>();

  async init(workspacePath: string): Promise<SnapshotInfo> {
    const version = this.bumpLifecycleVersion(workspacePath);

    if (this.snapshots.has(workspacePath)) {
      await this.removeSnapshot(workspacePath);
    }

    // Verify workspace directory exists before attempting git detection.
    // Temp directories (claude-temp-*, .gemini, etc.) may be deleted before init runs.
    try {
      const stat = await fs.stat(workspacePath);
      if (!stat.isDirectory()) {
        return { mode: 'snapshot', branch: null };
      }
    } catch {
      return { mode: 'snapshot', branch: null };
    }

    const mode = await this.detectMode(workspacePath);

    if (mode === 'git-repo') {
      return this.initGitRepo(workspacePath, version);
    }

    return { mode: 'snapshot', branch: null };
  }

  async compare(workspacePath: string): Promise<CompareResult> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return { staged: [], unstaged: [] };
    }

    return this.compareGitRepo(workspacePath);
  }

  async getBaselineContent(workspacePath: string, filePath: string): Promise<string | null> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync('git', ['show', `HEAD:${filePath}`], {
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
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return [];
    }
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
    await execFileAsync('git', ['add', '-A'], { cwd: workspacePath, maxBuffer: 10 * 1024 * 1024 });
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

  async resetFile(_workspacePath: string, _filePath: string, _operation: FileChangeInfo['operation']): Promise<void> {
    // Non-git snapshot baselines are disabled to avoid creating aionui-snapshot-* temp directories.
  }

  // --- Lifecycle ---

  async dispose(workspacePath: string): Promise<void> {
    this.bumpLifecycleVersion(workspacePath);
    await this.removeSnapshot(workspacePath);
  }

  private async removeSnapshot(workspacePath: string): Promise<void> {
    this.snapshots.delete(workspacePath);
  }

  async disposeAll(): Promise<void> {
    const workspaces = Array.from(this.snapshots.keys());
    await Promise.all(workspaces.map((ws) => this.dispose(ws)));
  }

  /**
   * Remove leftover `aionui-snapshot-*` directories from previous sessions
   * that were not cleaned up (e.g. due to a crash). Safe to call at startup
   * as a fire-and-forget — errors are silently ignored.
   */
  static async cleanupStaleSnapshots(): Promise<void> {
    const tmpdir = os.tmpdir();
    let entries: string[];
    try {
      entries = await fs.readdir(tmpdir);
    } catch {
      return;
    }

    const stale = entries.filter((name) => name.startsWith(SNAPSHOT_TEMP_PREFIX));
    await Promise.allSettled(stale.map((name) => fs.rm(path.join(tmpdir, name), { recursive: true, force: true })));
  }

  // --- Private ---

  private ensureGitRepo(workspacePath: string): void {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
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

  private async initGitRepo(workspacePath: string, version: number): Promise<SnapshotInfo> {
    let branch: string | null = null;
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspacePath });
      branch = stdout.trim() || null;
    } catch {
      // Detached HEAD or empty repo
    }

    if (!this.isCurrentLifecycleVersion(workspacePath, version)) {
      return { mode: 'git-repo', branch };
    }

    this.snapshots.set(workspacePath, {
      mode: 'git-repo',
      workspacePath,
      branch,
    });

    return { mode: 'git-repo', branch };
  }

  private bumpLifecycleVersion(workspacePath: string): number {
    const version = (this.lifecycleVersions.get(workspacePath) ?? 0) + 1;
    this.lifecycleVersions.set(workspacePath, version);
    return version;
  }

  private isCurrentLifecycleVersion(workspacePath: string, version: number): boolean {
    return this.lifecycleVersions.get(workspacePath) === version;
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
}
