/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { bridge } from '@/common/platform/bridge';
import { initGithubBridge } from '@/process/bridge/githubBridge';
import { gitHubService } from '@/process/services/github';

describe('githubBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let incoming: { emit: (name: string, data: unknown) => unknown } | undefined;
    bridge.adapter({
      emit(name, data) {
        return incoming?.emit(name, data);
      },
      on(emitter) {
        incoming = emitter;
      },
    });
    initGithubBridge();
  });

  it('registers and executes github:getRepo provider', async () => {
    const spy = vi.spyOn(gitHubService, 'getRepoInfo').mockResolvedValueOnce({
      owner: 'test-owner',
      repo: 'test-repo',
      detectedRemotes: [],
      hasGhCli: true,
      hasToken: false,
      source: 'git_remote',
    });

    const res = await ipcBridge.github.getRepo.invoke({ cwd: '/test/dir', project_id: 'p1' });
    expect(spy).toHaveBeenCalledWith('/test/dir', 'p1');
    expect(res.owner).toBe('test-owner');
  });

  it('registers and executes github:listIssues provider', async () => {
    const spy = vi.spyOn(gitHubService, 'listIssues').mockResolvedValueOnce([
      {
        id: 10,
        number: 10,
        title: 'Issue 10',
        body: 'Desc',
        state: 'open',
        author: { login: 'user' },
        labels: [],
        commentsCount: 0,
        createdAt: '2026-09-12T00:00:00Z',
        updatedAt: '2026-09-12T00:00:00Z',
        htmlUrl: 'url',
      },
    ]);

    const res = await ipcBridge.github.listIssues.invoke({
      state: 'open',
      project_id: 'p1',
      cwd: '/test/dir',
    });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ state: 'open' }), '/test/dir', 'p1');
    expect(res).toHaveLength(1);
    expect(res[0].number).toBe(10);
  });

  it('registers and executes github:createIssue provider', async () => {
    const spy = vi.spyOn(gitHubService, 'createIssue').mockResolvedValueOnce({
      id: 11,
      number: 11,
      title: 'Created Issue',
      body: 'Body',
      state: 'open',
      author: { login: 'me' },
      labels: [],
      commentsCount: 0,
      createdAt: '2026-09-12T00:00:00Z',
      updatedAt: '2026-09-12T00:00:00Z',
      htmlUrl: 'url11',
    });

    const res = await ipcBridge.github.createIssue.invoke({
      title: 'Created Issue',
      body: 'Body',
      project_id: 'p1',
      cwd: '/test/dir',
    });

    expect(spy).toHaveBeenCalled();
    expect(res.number).toBe(11);
  });

  it('registers and executes github:setRepo provider', async () => {
    const spy = vi.spyOn(gitHubService, 'setRepoInfo').mockReturnValueOnce();

    await ipcBridge.github.setRepo.invoke({
      project_id: 'p1',
      owner: 'my-org',
      repo: 'my-repo',
    });

    expect(spy).toHaveBeenCalledWith('p1', 'my-org', 'my-repo');
  });

  it('registers and executes github:setToken provider', async () => {
    const spy = vi.spyOn(gitHubService, 'setToken').mockReturnValueOnce();

    await ipcBridge.github.setToken.invoke({
      token: 'ghp_secretToken',
    });

    expect(spy).toHaveBeenCalledWith('ghp_secretToken');
  });

  it('registers and executes github:getIssue provider', async () => {
    const spy = vi.spyOn(gitHubService, 'getIssue').mockResolvedValueOnce({
      id: 99,
      number: 99,
      title: 'Issue 99',
      body: 'Body 99',
      state: 'open',
      author: { login: 'user99' },
      labels: [],
      commentsCount: 0,
      createdAt: '2026-09-12T00:00:00Z',
      updatedAt: '2026-09-12T00:00:00Z',
      htmlUrl: 'url99',
    });

    const res = await ipcBridge.github.getIssue.invoke({
      number: 99,
      owner: 'org',
      repo: 'repo',
      cwd: '/test/dir',
      project_id: 'p1',
    });

    expect(spy).toHaveBeenCalledWith(99, 'org', 'repo', '/test/dir', 'p1');
    expect(res.number).toBe(99);
  });
});
