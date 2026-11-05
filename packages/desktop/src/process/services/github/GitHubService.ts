/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { checkGhCliAvailable, createIssueWithGh, getIssueWithGh, listIssuesWithGh } from './ghCliRunner';
import { detectGitHubRemotes } from './gitRemoteResolver';
import { createIssueWithRest, getIssueWithRest, listIssuesWithRest } from './githubRestApi';
import type { GitHubCreateIssueInput, GitHubIssue, GitHubListIssuesFilter, GitHubRepoInfo } from './types';

export class GitHubService {
  private projectRepoOverrides = new Map<string, { owner: string; repo: string }>();
  private customToken?: string;

  public setToken(token: string): void {
    this.customToken = token.trim() || undefined;
  }

  public getToken(): string | undefined {
    return this.customToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  }

  public setRepoInfo(projectId: string, owner: string, repo: string): void {
    if (!owner || !repo) {
      this.projectRepoOverrides.delete(projectId);
    } else {
      this.projectRepoOverrides.set(projectId, {
        owner: owner.trim(),
        repo: repo.trim(),
      });
    }
  }

  public async getRepoInfo(cwd?: string, projectId?: string): Promise<GitHubRepoInfo> {
    const hasGhCli = await checkGhCliAvailable();
    const hasToken = Boolean(this.getToken());

    // 1. Check project-specific override
    if (projectId && this.projectRepoOverrides.has(projectId)) {
      const override = this.projectRepoOverrides.get(projectId)!;
      return {
        owner: override.owner,
        repo: override.repo,
        remoteName: 'manual',
        detectedRemotes: [],
        hasGhCli,
        hasToken,
        source: 'manual',
      };
    }

    // 2. Auto-detect from git remotes in cwd
    const detectedRemotes = await detectGitHubRemotes(cwd);
    if (detectedRemotes.length > 0) {
      const primary = detectedRemotes[0];
      return {
        owner: primary.owner,
        repo: primary.repo,
        remoteName: primary.remoteName,
        remoteUrl: primary.remoteUrl,
        detectedRemotes,
        hasGhCli,
        hasToken,
        source: 'git_remote',
      };
    }

    return {
      owner: '',
      repo: '',
      detectedRemotes: [],
      hasGhCli,
      hasToken,
      source: 'none',
    };
  }

  private async resolveTargetRepo(
    explicitOwner?: string,
    explicitRepo?: string,
    cwd?: string,
    projectId?: string
  ): Promise<{ owner: string; repo: string }> {
    if (explicitOwner && explicitRepo) {
      return { owner: explicitOwner.trim(), repo: explicitRepo.trim() };
    }

    const info = await this.getRepoInfo(cwd, projectId);
    if (info.owner && info.repo) {
      return { owner: info.owner, repo: info.repo };
    }

    throw new Error('No GitHub repository specified or detected in the current workspace.');
  }

  public async listIssues(filter: GitHubListIssuesFilter, cwd?: string, projectId?: string): Promise<GitHubIssue[]> {
    const { owner, repo } = await this.resolveTargetRepo(filter.owner, filter.repo, cwd, projectId);
    const hasGhCli = await checkGhCliAvailable();
    const token = this.getToken();

    // If GH CLI is available and user hasn't explicitly supplied a custom token, try GH CLI first
    if (hasGhCli && !this.customToken) {
      try {
        return await listIssuesWithGh(owner, repo, filter, cwd);
      } catch (err) {
        console.warn('[GitHubService] gh CLI failed to list issues, falling back to REST API:', err);
      }
    }

    return await listIssuesWithRest(owner, repo, filter, token);
  }

  public async getIssue(
    number: number,
    owner?: string,
    repo?: string,
    cwd?: string,
    projectId?: string
  ): Promise<GitHubIssue> {
    const resolved = await this.resolveTargetRepo(owner, repo, cwd, projectId);
    const hasGhCli = await checkGhCliAvailable();
    const token = this.getToken();

    if (hasGhCli && !this.customToken) {
      try {
        return await getIssueWithGh(resolved.owner, resolved.repo, number, cwd);
      } catch (err) {
        console.warn('[GitHubService] gh CLI failed to get issue, falling back to REST API:', err);
      }
    }

    return await getIssueWithRest(resolved.owner, resolved.repo, number, token);
  }

  public async createIssue(input: GitHubCreateIssueInput, cwd?: string, projectId?: string): Promise<GitHubIssue> {
    const { owner, repo } = await this.resolveTargetRepo(input.owner, input.repo, cwd, projectId);
    const hasGhCli = await checkGhCliAvailable();
    const token = this.getToken();

    if (hasGhCli && !this.customToken) {
      try {
        return await createIssueWithGh(owner, repo, input, cwd);
      } catch (err) {
        console.warn('[GitHubService] gh CLI failed to create issue, falling back to REST API:', err);
      }
    }

    return await createIssueWithRest(owner, repo, input, token);
  }
}

export const gitHubService = new GitHubService();
