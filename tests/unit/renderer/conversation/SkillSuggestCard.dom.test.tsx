/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillSuggestion } from '@/renderer/utils/chat/skillSuggestParser';

const mockHasSkill = vi.hoisted(() => vi.fn());
const mockSaveSkill = vi.hoisted(() => vi.fn());
const mockMessageSuccess = vi.hoisted(() => vi.fn());
const mockMessageError = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      hasSkill: { invoke: (...args: unknown[]) => mockHasSkill(...args) },
      saveSkill: { invoke: (...args: unknown[]) => mockSaveSkill(...args) },
    },
  },
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span data-testid='icon-down' />,
  Lightning: () => <span data-testid='icon-lightning' />,
  Up: () => <span data-testid='icon-up' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    loading,
    type,
    size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; type?: string; size?: string }) => (
    <button
      type='button'
      onClick={onClick}
      disabled={loading}
      data-loading={loading}
      data-button-type={type}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  ),
  Message: {
    success: mockMessageSuccess,
    error: mockMessageError,
  },
}));

vi.mock('@renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='markdown-view'>{children}</div>,
}));

import SkillSuggestCard from '@/renderer/pages/conversation/Messages/components/SkillSuggestCard';

describe('SkillSuggestCard', () => {
  const mockSuggestion: SkillSuggestion = {
    name: 'Test Skill',
    description: 'A test skill description',
    content: '---\nname: Test Skill\ndescription: A test skill\n---\n\n# Test Skill\n\nThis is a test skill.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSkill.mockResolvedValue(false);
    mockSaveSkill.mockResolvedValue(undefined);
  });

  it('renders skill suggestion name and description', async () => {
    render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    expect(screen.getByText('Test Skill')).toBeInTheDocument();
    expect(screen.getByText('A test skill description')).toBeInTheDocument();
    expect(screen.getByTestId('icon-lightning')).toBeInTheDocument();
  });

  it('does not render when skill already exists', async () => {
    mockHasSkill.mockResolvedValue(true);

    const { container } = render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('saves skill when save button is clicked', async () => {
    render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    const saveButton = screen.getByText('cron.skill.save');
    expect(saveButton).toBeInTheDocument();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSkill).toHaveBeenCalledWith({
        jobId: 'test-job-123',
        content: mockSuggestion.content,
      });
    });

    await waitFor(() => {
      expect(mockMessageSuccess).toHaveBeenCalledWith('cron.skill.saveSuccess');
    });
  });

  it('shows loading state while saving', async () => {
    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    mockSaveSkill.mockReturnValue(savePromise);

    render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    const saveButton = screen.getByText('cron.skill.save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toHaveAttribute('data-loading', 'true');
    });

    resolveSave!();

    await waitFor(() => {
      expect(mockMessageSuccess).toHaveBeenCalled();
    });
  });

  it('hides card after successful save', async () => {
    const { container } = render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    const saveButton = screen.getByText('cron.skill.save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSkill).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('shows error message when save fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSaveSkill.mockRejectedValue(new Error('Save failed'));

    render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    const saveButton = screen.getByText('cron.skill.save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSkill).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('cron.skill.saveFailed');
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('[SkillSuggestCard] Failed to save skill:', expect.any(Error));
    });

    // Card should still be visible after failed save
    expect(screen.getByText('Test Skill')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('hides card when dismiss button is clicked', async () => {
    const { container } = render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    const dismissButton = screen.getByText('cron.skill.dismiss');
    expect(dismissButton).toBeInTheDocument();

    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });

    // Should not call saveSkill when dismissing
    expect(mockSaveSkill).not.toHaveBeenCalled();
  });

  it('expands and collapses preview content when toggle is clicked', async () => {
    render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    // Preview should be collapsed initially
    expect(screen.queryByTestId('markdown-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('icon-down')).toBeInTheDocument();

    // Click to expand
    const previewToggle = screen.getByText('cron.skill.preview');
    fireEvent.click(previewToggle);

    // Preview should be visible now
    await waitFor(() => {
      expect(screen.getByTestId('markdown-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('icon-up')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(previewToggle);

    // Preview should be hidden again
    await waitFor(() => {
      expect(screen.queryByTestId('markdown-view')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('icon-down')).toBeInTheDocument();
  });

  it('renders preview content in markdown format when expanded', async () => {
    render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    const previewToggle = screen.getByText('cron.skill.preview');
    fireEvent.click(previewToggle);

    await waitFor(() => {
      const markdownView = screen.getByTestId('markdown-view');
      expect(markdownView).toBeInTheDocument();
      // Verify content is wrapped in markdown code fence
      expect(markdownView.textContent).toContain('```markdown');
      expect(markdownView.textContent).toContain(mockSuggestion.content);
    });
  });

  it('handles hasSkill check failure gracefully', async () => {
    mockHasSkill.mockRejectedValue(new Error('Network error'));

    render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    // Card should still render even if hasSkill check fails
    await waitFor(() => {
      expect(screen.getByText('Test Skill')).toBeInTheDocument();
    });
  });

  it('renders correct button types and sizes', async () => {
    render(<SkillSuggestCard suggestion={mockSuggestion} cronJobId='test-job-123' />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ jobId: 'test-job-123' });
    });

    const saveButton = screen.getByText('cron.skill.save');
    expect(saveButton).toHaveAttribute('data-button-type', 'primary');
    expect(saveButton).toHaveAttribute('data-size', 'small');

    const dismissButton = screen.getByText('cron.skill.dismiss');
    expect(dismissButton).toHaveAttribute('data-size', 'small');
  });
});
