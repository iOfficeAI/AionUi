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
const mockUpdateArtifact = vi.hoisted(() => vi.fn());
const mockMessageSuccess = vi.hoisted(() => vi.fn());
const mockMessageError = vi.hoisted(() => vi.fn());
const mockUpdateArtifactStatus = vi.hoisted(() => vi.fn());

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
    conversation: {
      updateArtifact: { invoke: (...args: unknown[]) => mockUpdateArtifact(...args) },
    },
  },
}));

vi.mock('@renderer/pages/conversation/Messages/artifacts', () => ({
  useUpdateConversationArtifactStatus: () => mockUpdateArtifactStatus,
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

  const baseProps = {
    artifact_id: 'artifact-1',
    conversation_id: 'conv-1',
    cron_job_id: 'test-job-123',
    suggestion: mockSuggestion,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSkill.mockResolvedValue(false);
    mockSaveSkill.mockResolvedValue(undefined);
    mockUpdateArtifact.mockResolvedValue(undefined);
  });

  it('renders skill suggestion name and description', async () => {
    render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    expect(screen.getByText('Test Skill')).toBeInTheDocument();
    expect(screen.getByText('A test skill description')).toBeInTheDocument();
    expect(screen.getByTestId('icon-lightning')).toBeInTheDocument();
  });

  it('does not render when skill already exists', async () => {
    mockHasSkill.mockResolvedValue(true);

    const { container } = render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('saves skill when save button is clicked', async () => {
    render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    fireEvent.click(screen.getByText('cron.skill.save'));

    await waitFor(() => {
      expect(mockSaveSkill).toHaveBeenCalledWith({
        job_id: 'test-job-123',
        content: mockSuggestion.content,
      });
      expect(mockUpdateArtifactStatus).toHaveBeenCalledWith('artifact-1', 'saved');
      expect(mockMessageSuccess).toHaveBeenCalledWith('cron.skill.saveSuccess');
    });
  });

  it('shows loading state while saving', async () => {
    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    mockSaveSkill.mockReturnValue(savePromise);

    render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
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
    const { container } = render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    fireEvent.click(screen.getByText('cron.skill.save'));

    await waitFor(() => {
      expect(mockSaveSkill).toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('shows error message when save fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSaveSkill.mockRejectedValue(new Error('Save failed'));

    render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    fireEvent.click(screen.getByText('cron.skill.save'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('cron.skill.saveFailed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[SkillSuggestCard] Failed to save skill:', expect.any(Error));
    });

    expect(screen.getByText('Test Skill')).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('dismisses artifact and hides the card when dismiss button is clicked', async () => {
    const { container } = render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    fireEvent.click(screen.getByText('cron.skill.dismiss'));

    await waitFor(() => {
      expect(mockUpdateArtifact).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        artifact_id: 'artifact-1',
        status: 'dismissed',
      });
      expect(mockUpdateArtifactStatus).toHaveBeenCalledWith('artifact-1', 'dismissed');
      expect(container).toBeEmptyDOMElement();
    });

    expect(mockSaveSkill).not.toHaveBeenCalled();
  });

  it('shows error message when dismiss fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpdateArtifact.mockRejectedValue(new Error('Dismiss failed'));

    render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    fireEvent.click(screen.getByText('cron.skill.dismiss'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('cron.skill.saveFailed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[SkillSuggestCard] Failed to dismiss artifact:', expect.any(Error));
    });

    expect(screen.getByText('Test Skill')).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('expands and collapses preview content when toggle is clicked', async () => {
    render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    expect(screen.queryByTestId('markdown-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('icon-down')).toBeInTheDocument();

    const previewToggle = screen.getByText('cron.skill.preview');
    fireEvent.click(previewToggle);

    await waitFor(() => {
      expect(screen.getByTestId('markdown-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('icon-up')).toBeInTheDocument();

    fireEvent.click(previewToggle);

    await waitFor(() => {
      expect(screen.queryByTestId('markdown-view')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('icon-down')).toBeInTheDocument();
  });

  it('renders preview content in markdown format when expanded', async () => {
    render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    fireEvent.click(screen.getByText('cron.skill.preview'));

    await waitFor(() => {
      const markdownView = screen.getByTestId('markdown-view');
      expect(markdownView).toBeInTheDocument();
      expect(markdownView.textContent).toContain('```markdown');
      expect(markdownView.textContent).toContain(mockSuggestion.content);
    });
  });

  it('handles hasSkill check failure gracefully', async () => {
    mockHasSkill.mockRejectedValue(new Error('Network error'));

    render(<SkillSuggestCard {...baseProps} />);

    await waitFor(() => {
      expect(mockHasSkill).toHaveBeenCalledWith({ job_id: 'test-job-123' });
    });

    await waitFor(() => {
      expect(screen.getByText('Test Skill')).toBeInTheDocument();
    });
  });
});
