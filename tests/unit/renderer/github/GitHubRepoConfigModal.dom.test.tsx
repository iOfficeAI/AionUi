/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GitHubRepoConfigModal } from '@/renderer/pages/conversation/GitHubIssues/GitHubRepoConfigModal';
import type { GitHubRepoInfo } from '@/renderer/pages/conversation/GitHubIssues/types';

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
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
  }),
}));

const mockRepoInfoWithGh: GitHubRepoInfo = {
  owner: 'iOfficeAI',
  repo: 'AionUi',
  source: 'git-remote',
  hasGhCli: true,
  detectedRemotes: [
    { remoteName: 'upstream', owner: 'iOfficeAI', repo: 'AionUi', url: 'https://github.com/iOfficeAI/AionUi.git' },
    { remoteName: 'origin', owner: 'EduCosta85', repo: 'AionUi', url: 'https://github.com/EduCosta85/AionUi.git' },
  ],
};

const mockRepoInfoWithoutGh: GitHubRepoInfo = {
  owner: '',
  repo: '',
  source: 'none',
  hasGhCli: false,
  detectedRemotes: [],
};

describe('GitHubRepoConfigModal', () => {
  it('displays gh CLI detected notice when hasGhCli is true', () => {
    render(<GitHubRepoConfigModal visible={true} repoInfo={mockRepoInfoWithGh} onCancel={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText(/GitHub CLI \(gh\) detected/i)).toBeInTheDocument();
  });

  it('displays gh CLI missing notice when hasGhCli is false', () => {
    render(
      <GitHubRepoConfigModal visible={true} repoInfo={mockRepoInfoWithoutGh} onCancel={vi.fn()} onSave={vi.fn()} />
    );

    expect(screen.getByText(/GitHub CLI not found/i)).toBeInTheDocument();
  });

  it('validates invalid repo format when slash is missing', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <GitHubRepoConfigModal visible={true} repoInfo={mockRepoInfoWithoutGh} onCancel={vi.fn()} onSave={onSave} />
    );

    const repoInput = screen.getByPlaceholderText('owner/repo (e.g. iOfficeAI/AionUi)');
    await user.clear(repoInput);
    await user.type(repoInput, 'invalid-repo-without-slash');

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Must be in owner/repo format')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves parsed owner and repo on submit', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <GitHubRepoConfigModal visible={true} repoInfo={mockRepoInfoWithoutGh} onCancel={onCancel} onSave={onSave} />
    );

    const repoInput = screen.getByPlaceholderText('owner/repo (e.g. iOfficeAI/AionUi)');
    const tokenInput = screen.getByPlaceholderText('ghp_...');

    await user.type(repoInput, 'owner-name/repo-name');
    await user.type(tokenInput, 'ghp_secretToken123');

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('owner-name', 'repo-name', 'ghp_secretToken123');
      expect(onCancel).toHaveBeenCalled();
    });
  });

  it('calls onCancel when clicking Cancel button', () => {
    const onCancel = vi.fn();

    render(<GitHubRepoConfigModal visible={true} repoInfo={mockRepoInfoWithGh} onCancel={onCancel} onSave={vi.fn()} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
