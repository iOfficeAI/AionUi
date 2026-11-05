/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIssueWithRest, getIssueWithRest, listIssuesWithRest } from '@/process/services/github/githubRestApi';

const originalFetch = global.fetch;

describe('githubRestApi', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('listIssuesWithRest filters out pull requests and returns GitHubIssue list', async () => {
    const mockApiResponse = [
      {
        id: 1,
        number: 42,
        title: 'Issue 42',
        body: 'Description 42',
        state: 'open',
        user: { login: 'user42', avatar_url: 'https://avatar.com/42' },
        labels: [{ id: 10, name: 'enhancement', color: '00ff00' }],
        comments: 2,
        created_at: '2026-09-12T08:00:00Z',
        html_url: 'https://github.com/iOfficeAI/AionUi/issues/42',
      },
      {
        id: 2,
        number: 43,
        title: 'Pull Request 43',
        body: 'PR body',
        state: 'open',
        pull_request: {}, // Should be filtered out
        user: { login: 'pr_author' },
        html_url: 'https://github.com/iOfficeAI/AionUi/pull/43',
      },
    ];

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);

    const issues = await listIssuesWithRest('iOfficeAI', 'AionUi', { state: 'open' }, 'my-token');
    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(42);
    expect(issues[0].title).toBe('Issue 42');
    expect(issues[0].labels[0].color).toBe('#00ff00');
    expect(issues[0].commentsCount).toBe(2);
  });

  it('listIssuesWithRest supports local search filtering', async () => {
    const mockApiResponse = [
      {
        id: 1,
        number: 1,
        title: 'Crash on startup',
        body: 'logs',
        state: 'open',
        created_at: '2026-09-12T08:00:00Z',
        html_url: 'url1',
      },
      {
        id: 2,
        number: 2,
        title: 'Improve speed',
        body: 'perf improvement',
        state: 'open',
        created_at: '2026-09-12T08:00:00Z',
        html_url: 'url2',
      },
    ];

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);

    const issues = await listIssuesWithRest('iOfficeAI', 'AionUi', { search: 'crash' });
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe('Crash on startup');
  });

  it('getIssueWithRest returns normalized issue and throws on HTTP error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 55,
        number: 55,
        title: 'Issue 55',
        state: 'closed',
        user: { login: 'tester' },
        created_at: '2026-09-12T08:00:00Z',
        html_url: 'https://github.com/iOfficeAI/AionUi/issues/55',
      }),
    } as Response);

    const issue = await getIssueWithRest('iOfficeAI', 'AionUi', 55);
    expect(issue.number).toBe(55);
    expect(issue.state).toBe('closed');

    // Error case
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as Response);

    await expect(getIssueWithRest('iOfficeAI', 'AionUi', 99999)).rejects.toThrow('GitHub API error (404)');
  });

  it('createIssueWithRest sends POST request and returns created issue', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url, init) => {
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body as string);
      expect(body.title).toBe('New Bug');
      return {
        ok: true,
        json: async () => ({
          id: 99,
          number: 99,
          title: body.title,
          body: body.body,
          state: 'open',
          user: { login: 'creator' },
          labels: [{ name: 'bug' }],
          created_at: '2026-09-12T08:00:00Z',
          html_url: 'https://github.com/iOfficeAI/AionUi/issues/99',
        }),
      } as Response;
    });

    const issue = await createIssueWithRest('iOfficeAI', 'AionUi', {
      title: 'New Bug',
      body: 'Bug details',
      labels: ['bug'],
    });

    expect(issue.number).toBe(99);
    expect(issue.title).toBe('New Bug');
  });
});
