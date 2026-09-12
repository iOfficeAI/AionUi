/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewIssueModal } from '@/renderer/pages/conversation/GitHubIssues/NewIssueModal';

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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string; repo?: string }) => {
      if (opts?.repo) return `New Issue in ${opts.repo}`;
      return opts?.defaultValue || key;
    },
  }),
}));

describe('NewIssueModal', () => {
  it('renders modal with repository name in title when visible', () => {
    render(<NewIssueModal visible={true} repoLabel='iOfficeAI/AionUi' onCancel={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByText('New Issue in iOfficeAI/AionUi')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Brief summary of the issue or bug')).toBeInTheDocument();
  });

  it('renders default title when no repoLabel is provided', () => {
    render(<NewIssueModal visible={true} onCancel={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByText('New Issue')).toBeInTheDocument();
  });

  it('validates required title before submitting', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NewIssueModal visible={true} onCancel={vi.fn()} onSubmit={onSubmit} />);

    const okButton = screen.getByText('Create Issue');
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid form data including parsed labels', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(<NewIssueModal visible={true} onCancel={onCancel} onSubmit={onSubmit} />);

    const titleInput = screen.getByPlaceholderText('Brief summary of the issue or bug');
    const bodyInput = screen.getByPlaceholderText('Describe the issue, steps to reproduce, or expected behavior...');
    const labelsInput = screen.getByPlaceholderText('bug, documentation, enhancement');

    await user.type(titleInput, 'Fix crash on startup');
    await user.type(bodyInput, 'App crashes when config is null');
    await user.type(labelsInput, 'bug, critical, windows');

    const okButton = screen.getByText('Create Issue');
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Fix crash on startup',
        body: 'App crashes when config is null',
        labels: ['bug', 'critical', 'windows'],
      });
      expect(onCancel).toHaveBeenCalled();
    });
  });

  it('calls onCancel when clicking Cancel button', () => {
    const onCancel = vi.fn();
    render(<NewIssueModal visible={true} onCancel={onCancel} onSubmit={vi.fn()} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handles submission errors gracefully', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network error'));
    const onCancel = vi.fn();

    render(<NewIssueModal visible={true} onCancel={onCancel} onSubmit={onSubmit} />);

    const titleInput = screen.getByPlaceholderText('Brief summary of the issue or bug');
    await user.type(titleInput, 'Issue that will fail');

    const okButton = screen.getByText('Create Issue');
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    // Should not call onCancel when submission fails
    expect(onCancel).not.toHaveBeenCalled();
  });
});
