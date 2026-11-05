/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ghCli from '@/process/services/github/ghCliRunner';
import * as gitResolver from '@/process/services/github/gitRemoteResolver';
import * as restApi from '@/process/services/github/githubRestApi';
import { GitHubService } from '@/process/services/github/GitHubService';

vi.mock('@/process/services/github/ghCliRunner');
vi.mock('@/process/services/github/gitRemoteResolver');
vi.mock('@/process/services/github/githubRestApi');

describe('GitHubService', () => {
  let service: GitHubService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitHubService();
  });

  it('getRepoInfo uses project override if set', async () => {
    service.setRepoInfo('proj-1', 'my-org', 'my-repo');
    const info = await service.getRepoInfo('/dummy/path', 'proj-1');

    expect(info.owner).toBe('my-org');
    expect(info.repo).toBe('my-repo');
    expect(info.source).toBe('manual');
  });

  it('getRepoInfo uses git remote discovery when no override exists', async () => {
    vi.mocked(gitResolver.detectGitHubRemotes).mockResolvedValueOnce([
      {
        remoteName: 'origin',
        owner: 'auto-org',
        repo: 'auto-repo',
        remoteUrl: 'git@github.com:auto-org/auto-repo.git',
      },
    ]);
    vi.mocked(ghCli.checkGhCliAvailable).mockResolvedValueOnce(true);

    const info = await service.getRepoInfo('/my/workspace', 'proj-2');
    expect(info.owner).toBe('auto-org');
    expect(info.repo).toBe('auto-repo');
    expect(info.source).toBe('git_remote');
    expect(info.hasGhCli).toBe(true);
  });

  it('sets and gets custom token', () => {
    expect(service.getToken()).toBeFalsy();
    service.setToken('ghp_test123');
    expect(service.getToken()).toBe('ghp_test123');
  });

  it('listIssues delegates to gh CLI when available without custom token', async () => {
    service.setRepoInfo('proj-1', 'owner1', 'repo1');
    vi.mocked(ghCli.checkGhCliAvailable).mockResolvedValue(true);
    vi.mocked(ghCli.listIssuesWithGh).mockResolvedValueOnce([
      {
        id: 1,
        number: 1,
        title: 'Issue 1',
        body: '',
        state: 'open',
        author: { login: 'u1' },
        labels: [],
        commentsCount: 0,
        createdAt: '2026-09-12T00:00:00Z',
        updatedAt: '2026-09-12T00:00:00Z',
        htmlUrl: 'https://github.com/owner1/repo1/issues/1',
      },
    ]);

    const issues = await service.listIssues({ state: 'open' }, undefined, 'proj-1');
    expect(issues).toHaveLength(1);
    expect(ghCli.listIssuesWithGh).toHaveBeenCalledTimes(1);
    expect(restApi.listIssuesWithRest).not.toHaveBeenCalled();
  });

  it('listIssues falls back to REST API if gh CLI fails', async () => {
    service.setRepoInfo('proj-1', 'owner1', 'repo1');
    vi.mocked(ghCli.checkGhCliAvailable).mockResolvedValue(true);
    vi.mocked(ghCli.listIssuesWithGh).mockRejectedValueOnce(new Error('gh error'));
    vi.mocked(restApi.listIssuesWithRest).mockResolvedValueOnce([
      {
        id: 2,
        number: 2,
        title: 'Issue 2',
        body: '',
        state: 'open',
        author: { login: 'u2' },
        labels: [],
        commentsCount: 0,
        createdAt: '2026-09-12T00:00:00Z',
        updatedAt: '2026-09-12T00:00:00Z',
        htmlUrl: 'https://github.com/owner1/repo1/issues/2',
      },
    ]);

    const issues = await service.listIssues({ state: 'open' }, undefined, 'proj-1');
    expect(issues).toHaveLength(1);
    expect(restApi.listIssuesWithRest).toHaveBeenCalledTimes(1);
  });

  it('createIssue delegates to gh CLI or falls back to REST API', async () => {
    service.setRepoInfo('proj-1', 'owner1', 'repo1');
    vi.mocked(ghCli.checkGhCliAvailable).mockResolvedValue(true);
    vi.mocked(ghCli.createIssueWithGh).mockResolvedValueOnce({
      id: 3,
      number: 3,
      title: 'Issue 3',
      body: 'body 3',
      state: 'open',
      author: { login: 'u3' },
      labels: [],
      commentsCount: 0,
      createdAt: '2026-09-12T00:00:00Z',
      updatedAt: '2026-09-12T00:00:00Z',
      htmlUrl: 'url3',
    });

    const issue = await service.createIssue({ title: 'Issue 3', body: 'body 3' }, undefined, 'proj-1');
    expect(issue.number).toBe(3);
    expect(ghCli.createIssueWithGh).toHaveBeenCalledTimes(1);
  });

  it('createIssue falls back to REST API if gh CLI fails', async () => {
    service.setRepoInfo('proj-1', 'owner1', 'repo1');
    vi.mocked(ghCli.checkGhCliAvailable).mockResolvedValue(true);
    vi.mocked(ghCli.createIssueWithGh).mockRejectedValueOnce(new Error('create error'));
    vi.mocked(restApi.createIssueWithRest).mockResolvedValueOnce({
      id: 4,
      number: 4,
      title: 'Issue 4',
      body: 'body 4',
      state: 'open',
      author: { login: 'u4' },
      labels: [],
      commentsCount: 0,
      createdAt: '2026-09-12T00:00:00Z',
      updatedAt: '2026-09-12T00:00:00Z',
      htmlUrl: 'url4',
    });

    const issue = await service.createIssue({ title: 'Issue 4', body: 'body 4' }, undefined, 'proj-1');
    expect(issue.number).toBe(4);
    expect(restApi.createIssueWithRest).toHaveBeenCalledTimes(1);
  });

  it('getIssue retrieves issue via gh CLI or falls back to REST API', async () => {
    service.setRepoInfo('proj-1', 'owner1', 'repo1');
    vi.mocked(ghCli.checkGhCliAvailable).mockResolvedValue(true);
    vi.mocked(ghCli.getIssueWithGh).mockResolvedValueOnce({
      id: 5,
      number: 5,
      title: 'Issue 5',
      body: '',
      state: 'open',
      author: { login: 'u5' },
      labels: [],
      commentsCount: 0,
      createdAt: '2026-09-12T00:00:00Z',
      updatedAt: '2026-09-12T00:00:00Z',
      htmlUrl: 'url5',
    });

    const issue = await service.getIssue(5, undefined, undefined, undefined, 'proj-1');
    expect(issue.number).toBe(5);
    expect(ghCli.getIssueWithGh).toHaveBeenCalledWith('owner1', 'repo1', 5, undefined);

    // Fallback path
    vi.mocked(ghCli.getIssueWithGh).mockRejectedValueOnce(new Error('get issue error'));
    vi.mocked(restApi.getIssueWithRest).mockResolvedValueOnce({
      id: 5,
      number: 5,
      title: 'Issue 5 from REST',
      body: '',
      state: 'open',
      author: { login: 'u5' },
      labels: [],
      commentsCount: 0,
      createdAt: '2026-09-12T00:00:00Z',
      updatedAt: '2026-09-12T00:00:00Z',
      htmlUrl: 'url5',
    });

    const issueFallback = await service.getIssue(5, 'custom-owner', 'custom-repo');
    expect(issueFallback.title).toBe('Issue 5 from REST');
    expect(restApi.getIssueWithRest).toHaveBeenCalled();
  });

  it('sets and retrieves custom token', () => {
    service.setToken('custom-token-value');
    expect(service.getToken()).toBe('custom-token-value');
  });
});
