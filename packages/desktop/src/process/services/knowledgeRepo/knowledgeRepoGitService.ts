/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);

export class GitExecutionError extends Error {
  code?: number | string;
  constructor(message: string, code?: number | string) {
    super(message);
    this.name = 'GitExecutionError';
    this.code = code;
  }
}

export type GitExecResult = {
  stdout: string;
  stderr: string;
};

/**
 * Validate that a URL is a valid https git URL.
 */
export function isValidGitHttpsUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('https://')) return false;
  // Disallow shell metacharacters and whitespace in git URL
  if (/[;\s&|`$<>'"\\]/.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    // Disallow userinfo in URL for security; tokens are passed separately via headers/credentials
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize ref name (branch/tag/commit SHA)
 */
export function sanitizeGitRef(ref: string): string {
  const trimmed = (ref || '').trim();
  if (!trimmed) return 'HEAD';
  // Allow only alphanumeric, slashes, dashes, dots, underscores
  if (!/^[a-zA-Z0-9._\-/]+$/.test(trimmed) || trimmed.includes('..')) {
    throw new Error(`Invalid git ref: "${ref}"`);
  }
  return trimmed;
}

export class KnowledgeRepoGitService {
  /**
   * Safe git command invocation without shell interpolation.
   */
  async runGit(args: string[], cwd?: string, authToken?: string): Promise<GitExecResult> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      // Prevent running hooks from the repo
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: process.platform === 'win32' ? 'NUL' : '/dev/null',
    };

    if (authToken) {
      // Pass auth header strictly via GIT_CONFIG environment variables rather than
      // CLI arguments, ensuring tokens never appear in process argument lists.
      env.GIT_CONFIG_COUNT = '2';
      env.GIT_CONFIG_KEY_1 = 'http.extraHeader';
      env.GIT_CONFIG_VALUE_1 = `Authorization: Bearer ${authToken}`;
    }

    const finalArgs = [...args];

    try {
      const { stdout, stderr } = await execFileAsync('git', finalArgs, {
        cwd,
        env,
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (err: unknown) {
      const error = err as { code?: number | string; message?: string; stderr?: string };
      const errMsg = error.stderr?.trim() || error.message || 'Git execution error';
      // Redact any potential auth tokens from output
      const sanitized = authToken ? errMsg.replaceAll(authToken, '[REDACTED]') : errMsg;
      throw new GitExecutionError(sanitized, error.code);
    }
  }

  /**
   * Clone a repo shallowly to the target directory.
   */
  async shallowClone(gitUrl: string, ref: string, targetDir: string, authToken?: string): Promise<string> {
    if (!isValidGitHttpsUrl(gitUrl)) {
      throw new Error(`Invalid HTTPS git URL: ${gitUrl}`);
    }
    const safeRef = sanitizeGitRef(ref || 'main');
    await fs.mkdir(path.dirname(targetDir), { recursive: true });

    // Ensure targetDir does not exist or is empty
    await fs.rm(targetDir, { recursive: true, force: true });

    await this.runGit(
      ['clone', '--depth', '1', '--branch', safeRef, '--no-tags', gitUrl, targetDir],
      undefined,
      authToken
    );

    return this.getHeadSha(targetDir);
  }

  /**
   * Get the current commit SHA of the repository.
   */
  async getHeadSha(repoDir: string): Promise<string> {
    const { stdout } = await this.runGit(['rev-parse', 'HEAD'], repoDir);
    return stdout;
  }

  /**
   * Get the remote SHA for a given ref without modifying working tree.
   */
  async getRemoteRefSha(gitUrl: string, ref: string, authToken?: string): Promise<string> {
    const safeRef = sanitizeGitRef(ref);
    const { stdout } = await this.runGit(
      ['ls-remote', gitUrl, safeRef, `refs/heads/${safeRef}`, `refs/tags/${safeRef}`],
      undefined,
      authToken
    );
    const lines = stdout.split('\n').filter(Boolean);
    if (lines.length === 0) {
      throw new Error(`Ref "${ref}" not found on remote ${gitUrl}`);
    }
    const [sha] = lines[0].split(/\s+/);
    return sha;
  }

  /**
   * Fast-forward fetch and update.
   * Throws if history diverged (force push) or not fast-forwardable.
   */
  async updateFastForward(
    repoDir: string,
    ref: string,
    authToken?: string
  ): Promise<{ oldSha: string; newSha: string }> {
    const oldSha = await this.getHeadSha(repoDir);
    const safeRef = sanitizeGitRef(ref || 'HEAD');

    // 1. Fetch remote commit shallowly
    await this.runGit(['fetch', '--depth', '1', 'origin', safeRef], repoDir, authToken);

    // 2. Check if FETCH_HEAD is fast-forwardable from current HEAD
    const { stdout: fetchHeadSha } = await this.runGit(['rev-parse', 'FETCH_HEAD'], repoDir);

    if (fetchHeadSha === oldSha) {
      return { oldSha, newSha: oldSha };
    }

    // Attempt fast-forward merge
    try {
      await this.runGit(['merge', '--ff-only', 'FETCH_HEAD'], repoDir);
    } catch {
      // Fast-forward failed (e.g. force push)
      throw new GitExecutionError(
        'Remote history was rewritten or cannot be fast-forwarded cleanly',
        'NOT_FAST_FORWARD'
      );
    }

    const newSha = await this.getHeadSha(repoDir);
    return { oldSha, newSha };
  }

  /**
   * Rollback repository to a known good commit SHA.
   */
  async rollback(repoDir: string, targetSha: string): Promise<string> {
    const safeSha = sanitizeGitRef(targetSha);
    await this.runGit(['reset', '--hard', safeSha], repoDir);
    return this.getHeadSha(repoDir);
  }

  /**
   * Get commit log between two commits.
   */
  async getCommitLog(repoDir: string, fromSha: string, toSha: string): Promise<string[]> {
    try {
      const { stdout } = await this.runGit(['log', '--pretty=format:%s', `${fromSha}..${toSha}`], repoDir);
      return stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Create or update a git worktree for a specific working copy.
   */
  async createWorktree(repoDir: string, worktreeDir: string, commitSha?: string): Promise<void> {
    await fs.mkdir(path.dirname(worktreeDir), { recursive: true });
    await fs.rm(worktreeDir, { recursive: true, force: true });
    const args = ['worktree', 'add', '--force', worktreeDir];
    if (commitSha) {
      args.push(sanitizeGitRef(commitSha));
    }
    await this.runGit(args, repoDir);
  }

  /**
   * Remove a git worktree safely.
   */
  async removeWorktree(repoDir: string, worktreeDir: string): Promise<void> {
    try {
      await this.runGit(['worktree', 'remove', '--force', worktreeDir], repoDir);
    } catch {
      await fs.rm(worktreeDir, { recursive: true, force: true });
    }
  }
}

export const knowledgeRepoGitService = new KnowledgeRepoGitService();
