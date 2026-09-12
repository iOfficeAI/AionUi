/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IssueCard } from '@/renderer/pages/conversation/GitHubIssues';
import type { GitHubIssue } from '@/renderer/pages/conversation/GitHubIssues/types';

const mockOpenExternalUrl = vi.fn();
vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string; count?: number }) => opts?.defaultValue || key,
    i18n: { language: 'en-US' },
  }),
}));

const createSampleIssue = (overrides?: Partial<GitHubIssue>): GitHubIssue => ({
  id: 101,
  number: 101,
  title: 'Fix memory leak in explorer worker',
  body: 'Steps to reproduce the memory leak in the worker thread...',
  state: 'open',
  author: { login: 'octocat', avatarUrl: 'https://example.com/avatar.png' },
  labels: [
    { name: 'bug', color: 'd73a4a' },
    { name: 'performance', color: 'a2eeef' },
  ],
  commentsCount: 5,
  createdAt: '2026-09-12T10:00:00Z',
  updatedAt: '2026-09-12T10:05:00Z',
  htmlUrl: 'https://github.com/iOfficeAI/AionUi/issues/101',
  ...overrides,
});

describe('IssueCard', () => {
  it('renders open issue with number, title, author, comments, and labels', () => {
    const issue = createSampleIssue();
    const onFix = vi.fn();
    const onInsert = vi.fn();

    render(<IssueCard issue={issue} onFix={onFix} onInsert={onInsert} />);

    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('Fix memory leak in explorer worker')).toBeInTheDocument();
    expect(screen.getByText('octocat')).toBeInTheDocument();
    expect(screen.getByText('5 comments')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('performance')).toBeInTheDocument();
    expect(screen.getByTitle('Open')).toBeInTheDocument();
  });

  it('renders closed issue with closed indicator', () => {
    const issue = createSampleIssue({ state: 'closed' });
    const onFix = vi.fn();
    const onInsert = vi.fn();

    render(<IssueCard issue={issue} onFix={onFix} onInsert={onInsert} />);

    expect(screen.getByTitle('Closed')).toBeInTheDocument();
  });

  it('triggers onFix when clicking the Fix with Agent button', () => {
    const issue = createSampleIssue();
    const onFix = vi.fn();
    const onInsert = vi.fn();

    render(<IssueCard issue={issue} onFix={onFix} onInsert={onInsert} />);

    const fixButton = screen.getByTestId('issue-fix-button-101');
    fireEvent.click(fixButton);

    expect(onFix).toHaveBeenCalledTimes(1);
    expect(onFix).toHaveBeenCalledWith(issue);
  });

  it('triggers onInsert when clicking the Insert in Chat button', () => {
    const issue = createSampleIssue();
    const onFix = vi.fn();
    const onInsert = vi.fn();

    render(<IssueCard issue={issue} onFix={onFix} onInsert={onInsert} />);

    const insertButton = screen.getByTestId('issue-insert-button-101');
    fireEvent.click(insertButton);

    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(issue);
  });

  it('opens external GitHub URL when clicking GitHub button', () => {
    mockOpenExternalUrl.mockClear();
    const issue = createSampleIssue({ htmlUrl: 'https://github.com/iOfficeAI/AionUi/issues/101' });
    const onFix = vi.fn();
    const onInsert = vi.fn();

    render(<IssueCard issue={issue} onFix={onFix} onInsert={onInsert} />);

    const githubLink = screen.getByTestId('issue-github-link-101');
    fireEvent.click(githubLink);

    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://github.com/iOfficeAI/AionUi/issues/101');
  });

  it('handles invalid date string gracefully without crashing', () => {
    const issue = createSampleIssue({ createdAt: 'not-a-valid-date' });
    const onFix = vi.fn();
    const onInsert = vi.fn();

    render(<IssueCard issue={issue} onFix={onFix} onInsert={onInsert} />);

    expect(screen.getByText('not-a-valid-date')).toBeInTheDocument();
  });

  it('renders correctly without labels and without comments', () => {
    const issue = createSampleIssue({ labels: [], commentsCount: 0 });
    const onFix = vi.fn();
    const onInsert = vi.fn();

    render(<IssueCard issue={issue} onFix={onFix} onInsert={onInsert} />);

    expect(screen.queryByText(/comments/)).not.toBeInTheDocument();
  });
});
