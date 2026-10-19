/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitter } from '@/renderer/utils/emitter';
import type { GitHubIssue, GitHubRepoInfo } from '@/renderer/pages/conversation/GitHubIssues/types';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

const mockGetRepo = vi.fn();
const mockListIssues = vi.fn();
const mockCreateIssue = vi.fn();
const mockSetRepo = vi.fn();
const mockSetToken = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    github: {
      getRepo: { invoke: (...args: unknown[]) => mockGetRepo(...args) },
      listIssues: { invoke: (...args: unknown[]) => mockListIssues(...args) },
      createIssue: { invoke: (...args: unknown[]) => mockCreateIssue(...args) },
      setRepo: { invoke: (...args: unknown[]) => mockSetRepo(...args) },
      setToken: { invoke: (...args: unknown[]) => mockSetToken(...args) },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string; number?: number }) => {
      if (opts?.number) return `Issue #${opts.number} action`;
      return opts?.defaultValue || key;
    },
    i18n: { language: 'en-US' },
  }),
}));

import { GitHubIssuesPanel } from '@/renderer/pages/conversation/GitHubIssues/GitHubIssuesPanel';

const sampleRepoInfo: GitHubRepoInfo = {
  owner: 'iOfficeAI',
  repo: 'AionUi',
  source: 'git-remote',
  hasGhCli: true,
  detectedRemotes: [],
};

const sampleIssues: GitHubIssue[] = [
  {
    id: 1,
    number: 1,
    title: 'Support markdown code block copy button',
    body: 'Add copy button to preview code blocks',
    state: 'open',
    author: { login: 'alice' },
    labels: [{ name: 'enhancement' }],
    commentsCount: 2,
    createdAt: '2026-09-12T00:00:00Z',
    updatedAt: '2026-09-12T01:00:00Z',
    htmlUrl: 'https://github.com/iOfficeAI/AionUi/issues/1',
  },
  {
    id: 2,
    number: 2,
    title: 'Fix white flash in dark mode on startup',
    body: 'Background color blinks white momentarily',
    state: 'open',
    author: { login: 'bob' },
    labels: [{ name: 'bug' }],
    commentsCount: 0,
    createdAt: '2026-09-12T02:00:00Z',
    updatedAt: '2026-09-12T03:00:00Z',
    htmlUrl: 'https://github.com/iOfficeAI/AionUi/issues/2',
  },
];

describe('GitHubIssuesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads repository and displays issues on mount', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue(sampleIssues);

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByText('iOfficeAI/AionUi')).toBeInTheDocument();
      expect(screen.getByText('Support markdown code block copy button')).toBeInTheDocument();
      expect(screen.getByText('Fix white flash in dark mode on startup')).toBeInTheDocument();
    });

    expect(mockGetRepo).toHaveBeenCalledWith({ cwd: '/path/to/project', project_id: 'test-proj' });
    expect(mockListIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'iOfficeAI',
        repo: 'AionUi',
        state: 'open',
      })
    );
  });

  it('renders empty state when no repo is detected', async () => {
    mockGetRepo.mockResolvedValue({
      owner: '',
      repo: '',
      source: 'none',
      hasGhCli: false,
      detectedRemotes: [],
    });
    mockListIssues.mockResolvedValue([]);

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByText('No GitHub repository detected')).toBeInTheDocument();
    });
  });

  it('renders empty state when repository has no issues', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue([]);

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByText('No issues found')).toBeInTheDocument();
    });
  });

  it('changes state filter and requests filtered issues', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue(sampleIssues);

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByText('Support markdown code block copy button')).toBeInTheDocument();
    });

    const closedRadio = screen.getByLabelText(/Closed/i);
    fireEvent.click(closedRadio);

    await waitFor(() => {
      expect(mockListIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'closed',
        })
      );
    });
  });

  it('dispatches fix prompt to chat when clicking Fix with Agent', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue(sampleIssues);

    const emitSpy = vi.spyOn(emitter, 'emit');

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByTestId('issue-fix-button-1')).toBeInTheDocument();
    });

    const fixButton = screen.getByTestId('issue-fix-button-1');
    fireEvent.click(fixButton);

    expect(emitSpy).toHaveBeenCalledWith(
      'sendbox.fill',
      expect.stringContaining('Please analyze and fix GitHub Issue #1 in iOfficeAI/AionUi')
    );
  });

  it('inserts issue prompt into chat when clicking Insert in Chat', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue(sampleIssues);

    const emitSpy = vi.spyOn(emitter, 'emit');

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByTestId('issue-insert-button-2')).toBeInTheDocument();
    });

    const insertButton = screen.getByTestId('issue-insert-button-2');
    fireEvent.click(insertButton);

    expect(emitSpy).toHaveBeenCalledWith(
      'sendbox.fill',
      expect.stringContaining('Please analyze and fix GitHub Issue #2 in iOfficeAI/AionUi')
    );
  });

  it('refreshes repository info and issues on clicking refresh button', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue(sampleIssues);

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByText('Support markdown code block copy button')).toBeInTheDocument();
    });

    const refreshButton = screen.getByTestId('github-refresh-button');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockGetRepo).toHaveBeenCalledTimes(2);
      expect(mockListIssues).toHaveBeenCalledTimes(2);
    });
  });

  it('performs search on pressing Enter in search box', async () => {
    const user = userEvent.setup();
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue(sampleIssues);

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search issues...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search issues...');
    fireEvent.change(searchInput, { target: { value: 'white flash' } });
    fireEvent.keyDown(searchInput, { key: 'Enter', keyCode: 13, code: 'Enter' });

    await waitFor(() => {
      expect(mockListIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'white flash',
        })
      );
    });
  });

  it('opens new issue modal and creates an issue', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue(sampleIssues);
    mockCreateIssue.mockResolvedValue({
      id: 3,
      number: 3,
      title: 'Newly created issue',
      state: 'open',
    });

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByTestId('github-new-issue-button')).toBeInTheDocument();
    });

    const newIssueBtn = screen.getByTestId('github-new-issue-button');
    fireEvent.click(newIssueBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Brief summary of the issue or bug')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('Brief summary of the issue or bug');
    fireEvent.change(titleInput, { target: { value: 'Newly created issue' } });

    const submitBtn = screen.getByText('Create Issue');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Newly created issue',
          owner: 'iOfficeAI',
          repo: 'AionUi',
          cwd: '/path/to/project',
          project_id: 'test-proj',
        })
      );
    });
  });

  it('opens repo config modal and saves updated settings', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockResolvedValue(sampleIssues);
    mockSetRepo.mockResolvedValue(undefined);
    mockSetToken.mockResolvedValue(undefined);

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(screen.getByTestId('github-settings-button')).toBeInTheDocument();
    });

    const settingsBtn = screen.getByTestId('github-settings-button');
    fireEvent.click(settingsBtn);

    await waitFor(() => {
      expect(screen.getByTestId('github-repo-config-modal')).toBeInTheDocument();
    });

    const repoInput = screen.getByPlaceholderText('owner/repo (e.g. iOfficeAI/AionUi)');
    fireEvent.change(repoInput, { target: { value: 'other-org/other-repo' } });

    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockSetRepo).toHaveBeenCalledWith({
        project_id: 'test-proj',
        owner: 'other-org',
        repo: 'other-repo',
      });
    });
  });

  it('handles error when listIssues rejects', async () => {
    mockGetRepo.mockResolvedValue(sampleRepoInfo);
    mockListIssues.mockRejectedValue(new Error('Network offline'));

    render(<GitHubIssuesPanel projectId='test-proj' cwd='/path/to/project' />);

    await waitFor(() => {
      expect(mockListIssues).toHaveBeenCalled();
    });
  });
});
