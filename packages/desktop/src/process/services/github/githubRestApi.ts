/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitHubCreateIssueInput, GitHubIssue, GitHubListIssuesFilter } from './types';

type GitHubRestRawIssue = {
  id: number;
  number: number;
  title: string;
  body?: string | null;
  state: string;
  user?: {
    login: string;
    avatar_url?: string;
  } | null;
  labels?: Array<
    | {
        id?: number;
        name: string;
        color?: string;
        description?: string;
      }
    | string
  >;
  comments?: number;
  created_at: string;
  updated_at?: string;
  html_url: string;
  pull_request?: unknown; // Issues endpoint returns PRs as well; we should filter out pull requests!
};

function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AionUi-Desktop',
  };
  const effectiveToken = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`;
  }
  return headers;
}

function normalizeRestIssue(raw: GitHubRestRawIssue): GitHubIssue {
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title || '',
    body: raw.body || '',
    state: raw.state.toLowerCase() === 'open' ? 'open' : 'closed',
    author: {
      login: raw.user?.login || 'unknown',
      avatarUrl: raw.user?.avatar_url,
    },
    labels: (raw.labels || []).map((l) => {
      if (typeof l === 'string') {
        return { name: l };
      }
      return {
        id: l.id,
        name: l.name,
        color: l.color ? (l.color.startsWith('#') ? l.color : `#${l.color}`) : undefined,
        description: l.description,
      };
    }),
    commentsCount: raw.comments || 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at || raw.created_at,
    htmlUrl: raw.html_url,
  };
}

/**
 * Lists issues via GitHub REST API. Excludes pull requests.
 */
export async function listIssuesWithRest(
  owner: string,
  repo: string,
  filter: GitHubListIssuesFilter,
  token?: string
): Promise<GitHubIssue[]> {
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`);
  url.searchParams.set('per_page', String(filter.limit || 30));
  url.searchParams.set('page', String(filter.page || 1));

  if (filter.state && filter.state !== 'all') {
    url.searchParams.set('state', filter.state);
  } else {
    url.searchParams.set('state', 'all');
  }

  const response = await fetch(url.toString(), {
    headers: getHeaders(token),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorText}`);
  }

  const rawIssues = (await response.json()) as GitHubRestRawIssue[];
  // Exclude pull requests which GitHub includes in /issues
  const issuesOnly = rawIssues.filter((item) => !item.pull_request);

  let results = issuesOnly.map(normalizeRestIssue);

  if (filter.search && filter.search.trim()) {
    const query = filter.search.toLowerCase();
    results = results.filter(
      (issue) =>
        issue.title.toLowerCase().includes(query) ||
        issue.number.toString() === query ||
        issue.body.toLowerCase().includes(query)
    );
  }

  return results;
}

/**
 * Gets a single issue via GitHub REST API.
 */
export async function getIssueWithRest(
  owner: string,
  repo: string,
  number: number,
  token?: string
): Promise<GitHubIssue> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`;
  const response = await fetch(url, {
    headers: getHeaders(token),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorText}`);
  }

  const rawIssue = (await response.json()) as GitHubRestRawIssue;
  return normalizeRestIssue(rawIssue);
}

/**
 * Creates a new issue via GitHub REST API.
 */
export async function createIssueWithRest(
  owner: string,
  repo: string,
  input: GitHubCreateIssueInput,
  token?: string
): Promise<GitHubIssue> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: input.labels,
      assignees: input.assignees,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorText}`);
  }

  const rawIssue = (await response.json()) as GitHubRestRawIssue;
  return normalizeRestIssue(rawIssue);
}
