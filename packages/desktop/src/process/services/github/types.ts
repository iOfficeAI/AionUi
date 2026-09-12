/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type GitHubRepoIdentity = {
  owner: string;
  repo: string;
  remoteName?: string;
  remoteUrl?: string;
};

export type GitHubRepoInfo = {
  owner: string;
  repo: string;
  remoteName?: string;
  remoteUrl?: string;
  detectedRemotes: GitHubRepoIdentity[];
  hasGhCli: boolean;
  hasToken: boolean;
  source: 'git_remote' | 'manual' | 'none';
};

export type GitHubIssueLabel = {
  id?: number | string;
  name: string;
  color?: string;
  description?: string;
};

export type GitHubIssueAuthor = {
  login: string;
  name?: string;
  avatarUrl?: string;
};

export type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  author: GitHubIssueAuthor;
  labels: GitHubIssueLabel[];
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
};

export type GitHubListIssuesFilter = {
  owner?: string;
  repo?: string;
  state?: 'open' | 'closed' | 'all';
  search?: string;
  limit?: number;
  page?: number;
};

export type GitHubCreateIssueInput = {
  owner?: string;
  repo?: string;
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
};
