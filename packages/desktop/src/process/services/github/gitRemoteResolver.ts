/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GitHubRepoIdentity } from './types';

const execFileAsync = promisify(execFile);

/**
 * Parses a git remote URL into owner and repo names if it points to GitHub.
 */
export function parseGitHubRemoteUrl(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const cleanUrl = url.trim();
  // Match patterns:
  // - git@github.com:owner/repo(.git)
  // - https://github.com/owner/repo(.git)
  // - ssh://git@github.com/owner/repo(.git)
  const match = cleanUrl.match(/github\.com[:/]([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
  };
}

/**
 * Parses raw `git remote -v` output and extracts all GitHub remotes.
 */
export function parseGitRemotesOutput(output: string): GitHubRepoIdentity[] {
  const remotesMap = new Map<string, GitHubRepoIdentity>();
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Format: "origin\tgit@github.com:owner/repo.git (fetch)"
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const remoteName = parts[0];
      const remoteUrl = parts[1];
      const parsed = parseGitHubRemoteUrl(remoteUrl);
      if (parsed) {
        remotesMap.set(remoteName, {
          remoteName,
          remoteUrl,
          owner: parsed.owner,
          repo: parsed.repo,
        });
      }
    }
  }

  // Sort priorities: 'upstream' first, then 'origin', then alphabetical
  return Array.from(remotesMap.values()).toSorted((a, b) => {
    if (a.remoteName === 'upstream') return -1;
    if (b.remoteName === 'upstream') return 1;
    if (a.remoteName === 'origin') return -1;
    if (b.remoteName === 'origin') return 1;
    return (a.remoteName || '').localeCompare(b.remoteName || '');
  });
}

/**
 * Discovers GitHub remotes for a project by executing `git remote -v` in its working directory.
 */
export async function detectGitHubRemotes(cwd?: string): Promise<GitHubRepoIdentity[]> {
  if (!cwd) return [];
  try {
    const { stdout } = await execFileAsync('git', ['remote', '-v'], {
      cwd,
      timeout: 3000,
      encoding: 'utf8',
    });
    return parseGitRemotesOutput(stdout);
  } catch {
    return [];
  }
}
