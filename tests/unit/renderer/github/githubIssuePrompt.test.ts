/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildIssueFixPrompt } from '@/renderer/pages/conversation/GitHubIssues/githubIssuePrompt';
import type { GitHubIssue } from '@/renderer/pages/conversation/GitHubIssues/types';

describe('githubIssuePrompt', () => {
  it('constructs detailed fix prompt including title, body, labels, and URL', () => {
    const issue: GitHubIssue = {
      id: 42,
      number: 42,
      title: 'Crash on startup when offline',
      body: 'When there is no internet, the app throws Uncaught Error.',
      state: 'open',
      author: { login: 'dev-user' },
      labels: [{ name: 'bug' }, { name: 'p1' }],
      commentsCount: 3,
      createdAt: '2026-09-12T00:00:00Z',
      updatedAt: '2026-09-12T00:00:00Z',
      htmlUrl: 'https://github.com/iOfficeAI/AionUi/issues/42',
    };

    const prompt = buildIssueFixPrompt(issue, 'iOfficeAI/AionUi');
    expect(prompt).toContain(
      'Please analyze and fix GitHub Issue #42 in iOfficeAI/AionUi: "Crash on startup when offline".'
    );
    expect(prompt).toContain('When there is no internet, the app throws Uncaught Error.');
    expect(prompt).toContain('bug, p1');
    expect(prompt).toContain('https://github.com/iOfficeAI/AionUi/issues/42');
    expect(prompt).toContain('Please inspect the codebase, identify the root cause');
  });

  it('handles empty body gracefully', () => {
    const issue: GitHubIssue = {
      id: 43,
      number: 43,
      title: 'Short issue title',
      body: '',
      state: 'open',
      author: { login: 'someone' },
      labels: [],
      commentsCount: 0,
      createdAt: '2026-09-12T00:00:00Z',
      updatedAt: '2026-09-12T00:00:00Z',
      htmlUrl: 'https://github.com/iOfficeAI/AionUi/issues/43',
    };

    const prompt = buildIssueFixPrompt(issue);
    expect(prompt).toContain('(No description provided in the issue)');
    expect(prompt).not.toContain('**Labels**:');
  });
});
