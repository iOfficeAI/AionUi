/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GitHubCreateIssueInput, GitHubIssue, GitHubListIssuesFilter } from './types';

const execFileAsync = promisify(execFile);

type GhRawIssue = {
  number: number;
  title: string;
  body?: string;
  state?: string;
  author?: {
    login?: string;
    name?: string;
  };
  labels?: Array<{
    id?: string | number;
    name: string;
    color?: string;
    description?: string;
  }>;
  comments?: unknown[];
  commentsCount?: number;
  createdAt: string;
  updatedAt?: string;
  url: string;
};

/**
 * Checks whether the GitHub CLI (`gh`) is installed and runnable.
 */
export async function checkGhCliAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gh', ['--version'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes gh JSON output into strongly-typed GitHubIssue.
 */
function normalizeGhIssue(raw: GhRawIssue): GitHubIssue {
  return {
    id: raw.number,
    number: raw.number,
    title: raw.title || '',
    body: raw.body || '',
    state: (raw.state || 'OPEN').toUpperCase() === 'OPEN' ? 'open' : 'closed',
    author: {
      login: raw.author?.login || raw.author?.name || 'unknown',
      name: raw.author?.name,
    },
    labels: (raw.labels || []).map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color ? (l.color.startsWith('#') ? l.color : `#${l.color}`) : undefined,
      description: l.description,
    })),
    commentsCount: Array.isArray(raw.comments) ? raw.comments.length : raw.commentsCount || 0,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    htmlUrl: raw.url,
  };
}

/**
 * Lists issues using `gh issue list`.
 */
export async function listIssuesWithGh(
  owner: string,
  repo: string,
  filter: GitHubListIssuesFilter,
  cwd?: string
): Promise<GitHubIssue[]> {
  const args = [
    'issue',
    'list',
    '-R',
    `${owner}/${repo}`,
    '--limit',
    String(filter.limit || 30),
    '--json',
    'number,title,body,state,author,labels,comments,createdAt,updatedAt,url',
  ];

  if (filter.state && filter.state !== 'all') {
    args.push('--state', filter.state);
  } else {
    args.push('--state', 'all');
  }

  if (filter.search && filter.search.trim()) {
    args.push('--search', filter.search.trim());
  }

  const { stdout } = await execFileAsync('gh', args, {
    cwd,
    timeout: 15000,
    encoding: 'utf8',
  });

  const parsed = JSON.parse(stdout) as GhRawIssue[];
  return parsed.map(normalizeGhIssue);
}

/**
 * Retrieves a single issue by number using `gh issue view`.
 */
export async function getIssueWithGh(owner: string, repo: string, number: number, cwd?: string): Promise<GitHubIssue> {
  const args = [
    'issue',
    'view',
    String(number),
    '-R',
    `${owner}/${repo}`,
    '--json',
    'number,title,body,state,author,labels,comments,createdAt,updatedAt,url',
  ];

  const { stdout } = await execFileAsync('gh', args, {
    cwd,
    timeout: 10000,
    encoding: 'utf8',
  });

  const parsed = JSON.parse(stdout) as GhRawIssue;
  return normalizeGhIssue(parsed);
}

/**
 * Creates an issue using `gh issue create`.
 */
export async function createIssueWithGh(
  owner: string,
  repo: string,
  input: GitHubCreateIssueInput,
  cwd?: string
): Promise<GitHubIssue> {
  const args = ['issue', 'create', '-R', `${owner}/${repo}`, '--title', input.title, '--body', input.body];

  if (input.labels && input.labels.length > 0) {
    for (const label of input.labels) {
      args.push('--label', label);
    }
  }

  if (input.assignees && input.assignees.length > 0) {
    for (const assignee of input.assignees) {
      args.push('--assignee', assignee);
    }
  }

  const { stdout } = await execFileAsync('gh', args, {
    cwd,
    timeout: 15000,
    encoding: 'utf8',
  });

  // stdout is the URL of the created issue, e.g. "https://github.com/owner/repo/issues/123\n"
  const createdUrl = stdout.trim();
  const match = createdUrl.match(/\/issues\/(\d+)/);
  if (match) {
    const issueNum = parseInt(match[1], 10);
    try {
      return await getIssueWithGh(owner, repo, issueNum, cwd);
    } catch {
      // Fallback if view fails
    }
    return {
      id: issueNum,
      number: issueNum,
      title: input.title,
      body: input.body,
      state: 'open',
      author: { login: 'me' },
      labels: (input.labels || []).map((name) => ({ name })),
      commentsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      htmlUrl: createdUrl,
    };
  }

  throw new Error(`Failed to parse created issue URL: ${stdout}`);
}
