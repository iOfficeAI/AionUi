/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import * as childProcess from 'child_process';
import {
  checkGhCliAvailable,
  createIssueWithGh,
  getIssueWithGh,
  listIssuesWithGh,
} from '@/process/services/github/ghCliRunner';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('ghCliRunner', () => {
  it('checkGhCliAvailable returns true when gh command succeeds', async () => {
    vi.mocked(childProcess.execFile).mockImplementation((_cmd, _args, _opts, callback: unknown) => {
      const cb = callback as (err: null, result: { stdout: string; stderr: string }) => void;
      cb(null, { stdout: 'gh version 2.97.0', stderr: '' });
      return {} as childProcess.ChildProcess;
    });

    const available = await checkGhCliAvailable();
    expect(available).toBe(true);
  });

  it('checkGhCliAvailable returns false when gh command fails', async () => {
    vi.mocked(childProcess.execFile).mockImplementation((_cmd, _args, _opts, callback: unknown) => {
      const cb = callback as (err: Error, result: { stdout: string; stderr: string }) => void;
      cb(new Error('command not found'), { stdout: '', stderr: '' });
      return {} as childProcess.ChildProcess;
    });

    const available = await checkGhCliAvailable();
    expect(available).toBe(false);
  });

  it('listIssuesWithGh returns parsed issues from gh output', async () => {
    const rawGhOutput = JSON.stringify([
      {
        number: 101,
        title: 'Fix crashing bug',
        body: 'Details about crash',
        state: 'OPEN',
        author: { login: 'octocat', name: 'Mona Lisa' },
        labels: [{ id: 1, name: 'bug', color: 'ff0000', description: 'Bug report' }],
        comments: [{}],
        createdAt: '2026-09-12T10:00:00Z',
        updatedAt: '2026-09-12T10:05:00Z',
        url: 'https://github.com/iOfficeAI/AionUi/issues/101',
      },
    ]);

    vi.mocked(childProcess.execFile).mockImplementation((_cmd, _args, _opts, callback: unknown) => {
      const cb = callback as (err: null, result: { stdout: string; stderr: string }) => void;
      cb(null, { stdout: rawGhOutput, stderr: '' });
      return {} as childProcess.ChildProcess;
    });

    const issues = await listIssuesWithGh('iOfficeAI', 'AionUi', { state: 'open', limit: 10 });
    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(101);
    expect(issues[0].title).toBe('Fix crashing bug');
    expect(issues[0].state).toBe('open');
    expect(issues[0].labels[0].color).toBe('#ff0000');
    expect(issues[0].commentsCount).toBe(1);
  });

  it('getIssueWithGh returns single issue', async () => {
    const rawIssue = JSON.stringify({
      number: 102,
      title: 'Issue 102',
      body: 'Body 102',
      state: 'CLOSED',
      author: { login: 'user1' },
      labels: [],
      comments: [],
      createdAt: '2026-09-12T09:00:00Z',
      url: 'https://github.com/iOfficeAI/AionUi/issues/102',
    });

    vi.mocked(childProcess.execFile).mockImplementation((_cmd, _args, _opts, callback: unknown) => {
      const cb = callback as (err: null, result: { stdout: string; stderr: string }) => void;
      cb(null, { stdout: rawIssue, stderr: '' });
      return {} as childProcess.ChildProcess;
    });

    const issue = await getIssueWithGh('iOfficeAI', 'AionUi', 102);
    expect(issue.number).toBe(102);
    expect(issue.state).toBe('closed');
  });

  it('createIssueWithGh runs gh issue create and parses result', async () => {
    vi.mocked(childProcess.execFile).mockImplementation((cmd, args, _opts, callback: unknown) => {
      const cb = callback as (err: null, result: { stdout: string; stderr: string }) => void;
      const strArgs = (args as string[]).join(' ');
      if (strArgs.includes('issue create')) {
        cb(null, { stdout: 'https://github.com/iOfficeAI/AionUi/issues/105\n', stderr: '' });
      } else if (strArgs.includes('issue view')) {
        cb(null, {
          stdout: JSON.stringify({
            number: 105,
            title: 'New issue',
            body: 'New body',
            state: 'OPEN',
            author: { login: 'me' },
            labels: [{ name: 'bug' }],
            url: 'https://github.com/iOfficeAI/AionUi/issues/105',
            createdAt: '2026-09-12T10:00:00Z',
          }),
          stderr: '',
        });
      }
      return {} as childProcess.ChildProcess;
    });

    const issue = await createIssueWithGh('iOfficeAI', 'AionUi', {
      title: 'New issue',
      body: 'New body',
      labels: ['bug'],
      assignees: ['me'],
    });

    expect(issue.number).toBe(105);
    expect(issue.title).toBe('New issue');
  });
});
