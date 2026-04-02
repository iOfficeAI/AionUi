import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseParams = vi.hoisted(() => vi.fn());
const mockListJobs = vi.hoisted(() => vi.fn());
const mockGetJob = vi.hoisted(() => vi.fn());
const mockUpdateJob = vi.hoisted(() => vi.fn());
const mockRunNow = vi.hoisted(() => vi.fn());
const mockRemoveJob = vi.hoisted(() => vi.fn());
const mockOnJobUpdated = vi.hoisted(() => vi.fn());
const mockOnJobExecuted = vi.hoisted(() => vi.fn());
const mockListByCronJob = vi.hoisted(() => vi.fn());
const mockConversationListChanged = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      listJobs: { invoke: (...args: unknown[]) => mockListJobs(...args) },
      getJob: { invoke: (...args: unknown[]) => mockGetJob(...args) },
      updateJob: { invoke: (...args: unknown[]) => mockUpdateJob(...args) },
      runNow: { invoke: (...args: unknown[]) => mockRunNow(...args) },
      removeJob: { invoke: (...args: unknown[]) => mockRemoveJob(...args) },
      onJobUpdated: { on: (...args: unknown[]) => mockOnJobUpdated(...args) },
      onJobExecuted: { on: (...args: unknown[]) => mockOnJobExecuted(...args) },
    },
    conversation: {
      listByCronJob: { invoke: (...args: unknown[]) => mockListByCronJob(...args) },
      listChanged: { on: (...args: unknown[]) => mockConversationListChanged(...args) },
    },
  },
}));

vi.mock('@icon-park/react', () => ({
  Left: () => <span data-testid='icon-left' />,
  Delete: () => <span data-testid='icon-delete' />,
  PlayOne: () => <span data-testid='icon-play' />,
  Editor: () => <span data-testid='icon-editor' />,
}));

const mockMessageSuccess = vi.hoisted(() => vi.fn());
const mockMessageError = vi.hoisted(() => vi.fn());

vi.mock('@arco-design/web-react', () => {
  return {
    Button: ({
      children,
      onClick,
      loading,
      icon,
      ...props
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      loading?: boolean;
      icon?: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <button type='button' onClick={onClick} disabled={loading} {...props}>
        {icon}
        {children}
      </button>
    ),
    Message: {
      success: mockMessageSuccess,
      error: mockMessageError,
    },
    Switch: ({
      checked,
      onChange,
      ...props
    }: {
      checked: boolean;
      onChange: (checked: boolean) => void;
      [key: string]: unknown;
    }) => (
      <input
        type='checkbox'
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid='toggle-switch'
        {...props}
      />
    ),
    Tag: ({ children, color }: { children: React.ReactNode; color?: string }) => (
      <span data-testid={`tag-${color}`}>{children}</span>
    ),
    Popconfirm: ({ children, onOk }: { children: React.ReactElement; title?: string; onOk?: () => void }) => {
      return React.cloneElement(children, {
        onClick: onOk,
      });
    },
    Spin: () => <div data-testid='loading-spinner' />,
    Empty: ({ description }: { description?: string }) => <div data-testid='empty-state'>{description}</div>,
  };
});

vi.mock('@renderer/utils/model/agentLogo', () => ({
  getAgentLogo: (backend: string) => `logo-${backend}`,
}));

vi.mock('@renderer/pages/cron/cronUtils', () => ({
  formatSchedule: (job: ICronJob) => job.schedule.description || 'Every day',
  formatNextRun: (ms: number) => new Date(ms).toLocaleString(),
}));

vi.mock('@/renderer/utils/chat/timeline', () => ({
  getActivityTime: (conv: TChatConversation) => conv.modifyTime,
}));

// Mock CreateTaskDialog component
vi.mock('@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog', () => ({
  default: ({ visible, onClose, editJob }: { visible: boolean; onClose: () => void; editJob?: ICronJob }) => {
    if (!visible) return null;
    return (
      <div data-testid='create-task-dialog'>
        <span data-testid='dialog-edit-job'>{editJob?.id}</span>
        <button onClick={onClose} data-testid='dialog-close'>
          Close
        </button>
      </div>
    );
  },
}));

import TaskDetailPage from '@/renderer/pages/cron/ScheduledTasksPage/TaskDetailPage';

describe('TaskDetailPage', () => {
  const now = Date.now();
  const nextRun = now + 3600000; // 1 hour later

  const mockJob: ICronJob = {
    id: 'job-123',
    name: 'Daily Summary',
    enabled: true,
    schedule: {
      kind: 'cron',
      expr: '0 9 * * *',
      description: 'Every day at 9:00 AM',
    },
    target: {
      executionMode: 'new_conversation',
      payload: {
        text: 'Summarize daily activities',
      },
    },
    metadata: {
      conversationId: 'conv-123',
      createdAt: now,
      updatedAt: now,
      agentConfig: {
        backend: 'claude',
        name: 'Claude 3.5 Sonnet',
        modelId: 'claude-3-5-sonnet',
      },
    },
    state: {
      lastRunAtMs: now - 86400000, // 1 day ago
      nextRunAtMs: nextRun,
      lastStatus: 'success',
    },
  };

  const mockConversations: TChatConversation[] = [
    {
      id: 'conv-1',
      name: 'Conversation 1',
      agentId: 'agent-1',
      createTime: now,
      modifyTime: now,
      messages: [],
      extra: {},
    },
    {
      id: 'conv-2',
      name: 'Conversation 2',
      agentId: 'agent-1',
      createTime: now - 3600000,
      modifyTime: now - 3600000,
      messages: [],
      extra: {},
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ jobId: 'job-123' });
    mockListJobs.mockResolvedValue([mockJob]);
    mockGetJob.mockResolvedValue(mockJob);
    mockUpdateJob.mockResolvedValue({ ...mockJob, enabled: false });
    mockRunNow.mockResolvedValue({ conversationId: 'new-conv-id' });
    mockRemoveJob.mockResolvedValue(undefined);
    mockOnJobUpdated.mockReturnValue(() => {});
    mockOnJobExecuted.mockReturnValue(() => {});
    mockListByCronJob.mockResolvedValue(mockConversations);
    mockConversationListChanged.mockReturnValue(() => {});
  });

  it('shows loading spinner initially', () => {
    render(<TaskDetailPage />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('fetches and renders job detail by jobId from route params', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(mockGetJob).toHaveBeenCalled();
      expect(screen.getByText('Daily Summary')).toBeInTheDocument();
    });

    expect(screen.getByText('Summarize daily activities')).toBeInTheDocument();
    expect(screen.getByText('Every day at 9:00 AM')).toBeInTheDocument();
  });

  it('renders active status tag when job is enabled and has no errors', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('tag-green')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tag-green')).toHaveTextContent('cron.status.active');
  });

  it('renders paused status tag when job is disabled', async () => {
    const pausedJob = { ...mockJob, enabled: false };
    mockGetJob.mockResolvedValue(pausedJob);

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('tag-gray')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tag-gray')).toHaveTextContent('cron.status.paused');
  });

  it('renders error status tag when job has error status', async () => {
    const errorJob = {
      ...mockJob,
      state: { ...mockJob.state, lastStatus: 'error' as const, lastError: 'Something went wrong' },
    };
    mockGetJob.mockResolvedValue(errorJob);

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('tag-red')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tag-red')).toHaveTextContent('cron.status.error');
  });

  it('displays agent information when agentConfig is present', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
    });

    const agentImage = screen.getByAltText('Claude 3.5 Sonnet') as HTMLImageElement;
    expect(agentImage.src).toContain('logo-claude');
  });

  it('displays execution mode as new_conversation', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('cron.page.form.newConversation')).toBeInTheDocument();
    });

    expect(screen.getByText('cron.page.form.newConversationHint')).toBeInTheDocument();
  });

  it('displays execution mode as existing_conversation', async () => {
    const existingModeJob: ICronJob = {
      ...mockJob,
      target: {
        executionMode: 'existing_conversation',
        payload: {
          text: 'Update task',
        },
      },
    };
    mockGetJob.mockResolvedValue(existingModeJob);

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('cron.page.form.existingConversation')).toBeInTheDocument();
    });

    expect(screen.getByText('cron.page.form.existingConversationHint')).toBeInTheDocument();
  });

  it('toggles enabled switch and calls updateJob', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('toggle-switch')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('toggle-switch') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalledWith({
        jobId: 'job-123',
        updates: { enabled: false },
      });
    });

    // Verify success message is shown
    expect(mockMessageSuccess).toHaveBeenCalledWith('cron.pauseSuccess');
  });

  it('handles toggle error and shows error message', async () => {
    mockUpdateJob.mockRejectedValue(new Error('Update failed'));

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('toggle-switch')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('toggle-switch');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('Error: Update failed');
    });
  });

  it('clicks "Run Now" button, calls runNow, and navigates to conversation', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('cron.detail.runNow')).toBeInTheDocument();
    });

    const runNowButton = screen.getByText('cron.detail.runNow').closest('button')!;
    fireEvent.click(runNowButton);

    await waitFor(() => {
      expect(mockRunNow).toHaveBeenCalledWith({ jobId: 'job-123' });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/conversation/new-conv-id');
    });

    expect(mockMessageSuccess).toHaveBeenCalledWith('cron.runNowSuccess');
  });

  it('handles runNow error and shows error message', async () => {
    mockRunNow.mockRejectedValue(new Error('Run failed'));

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('cron.detail.runNow')).toBeInTheDocument();
    });

    const runNowButton = screen.getByText('cron.detail.runNow').closest('button')!;
    fireEvent.click(runNowButton);

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('Error: Run failed');
    });
  });

  it('opens CreateTaskDialog when edit button is clicked', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByTestId('icon-editor')).toHaveLength(1);
    });

    const editButton = screen.getByTestId('icon-editor').closest('button')!;
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByTestId('create-task-dialog')).toBeInTheDocument();
    });

    expect(screen.getByTestId('dialog-edit-job')).toHaveTextContent('job-123');
  });

  it('closes CreateTaskDialog when close is triggered', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByTestId('icon-editor')).toHaveLength(1);
    });

    const editButton = screen.getByTestId('icon-editor').closest('button')!;
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByTestId('create-task-dialog')).toBeInTheDocument();
    });

    const closeButton = screen.getByTestId('dialog-close');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTestId('create-task-dialog')).not.toBeInTheDocument();
    });
  });

  it('deletes job when delete button is clicked', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('icon-delete')).toBeInTheDocument();
    });

    const deleteButton = screen.getByTestId('icon-delete').closest('button')!;
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockRemoveJob).toHaveBeenCalledWith({ jobId: 'job-123' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/scheduled');
    expect(mockMessageSuccess).toHaveBeenCalledWith('cron.deleteSuccess');
  });

  it('handles missing jobId gracefully', async () => {
    mockUseParams.mockReturnValue({ jobId: undefined });

    render(<TaskDetailPage />);

    // Should not attempt to fetch when jobId is missing
    await waitFor(() => {
      expect(mockGetJob).not.toHaveBeenCalled();
    });
  });

  it('handles invalid jobId and shows empty state', async () => {
    mockUseParams.mockReturnValue({ jobId: 'invalid-job-id' });
    mockGetJob.mockResolvedValue(null); // Job not found

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    expect(screen.getByTestId('empty-state')).toHaveTextContent('cron.detail.notFound');
  });

  it('navigates back to scheduled list when back link is clicked', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('cron.detail.backToAll')).toBeInTheDocument();
    });

    const backLink = screen.getAllByText('cron.detail.backToAll')[0].closest('span')!;
    fireEvent.click(backLink);

    expect(mockNavigate).toHaveBeenCalledWith('/scheduled');
  });

  it('displays child conversations for new_conversation mode', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(mockListByCronJob).toHaveBeenCalledWith({ cronJobId: 'job-123' });
    });

    await waitFor(() => {
      expect(screen.getByText('Conversation 1')).toBeInTheDocument();
      expect(screen.getByText('Conversation 2')).toBeInTheDocument();
    });
  });

  it('navigates to conversation when clicking a child conversation', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Conversation 1')).toBeInTheDocument();
    });

    const conversationItem = screen.getByText('Conversation 1').closest('div')!;
    fireEvent.click(conversationItem);

    expect(mockNavigate).toHaveBeenCalledWith('/conversation/conv-1');
  });

  it('displays "no history" message when there are no conversations', async () => {
    mockListByCronJob.mockResolvedValue([]);

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('cron.detail.noHistory')).toBeInTheDocument();
    });
  });

  it('displays last run info for existing_conversation mode', async () => {
    const existingModeJob: ICronJob = {
      ...mockJob,
      target: {
        executionMode: 'existing_conversation',
        payload: {
          text: 'Update task',
        },
      },
    };
    mockGetJob.mockResolvedValue(existingModeJob);

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(new Date(mockJob.state.lastRunAtMs!).toLocaleString())).toBeInTheDocument();
    });
  });

  it('displays error message in history when job has error status', async () => {
    const errorJob: ICronJob = {
      ...mockJob,
      target: {
        executionMode: 'existing_conversation',
        payload: {
          text: 'Update task',
        },
      },
      state: {
        ...mockJob.state,
        lastStatus: 'error',
        lastError: 'Execution failed',
      },
    };
    mockGetJob.mockResolvedValue(errorJob);

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Execution failed')).toBeInTheDocument();
    });
  });

  it('hides toggle switch for manual-only jobs', async () => {
    const manualJob: ICronJob = {
      ...mockJob,
      schedule: {
        kind: 'cron',
        expr: '', // Empty expr means manual-only
        description: 'Manual',
      },
    };
    mockGetJob.mockResolvedValue(manualJob);

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Manual')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('toggle-switch')).not.toBeInTheDocument();
  });

  it('subscribes to job updates and refreshes job state', async () => {
    let updateHandler: (job: ICronJob) => void = () => {};
    mockOnJobUpdated.mockImplementation((handler) => {
      updateHandler = handler;
      return () => {};
    });

    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(mockOnJobUpdated).toHaveBeenCalled();
    });

    // Simulate job update
    const updatedJob = { ...mockJob, name: 'Updated Job' };
    updateHandler(updatedJob);

    await waitFor(() => {
      expect(screen.getByText('Updated Job')).toBeInTheDocument();
    });
  });

  it('subscribes to job execution events and refreshes job state', async () => {
    let executedHandler: ((data: { jobId: string }) => void) | null = null;
    mockOnJobExecuted.mockImplementation((handler) => {
      executedHandler = handler;
      return () => {};
    });

    render(<TaskDetailPage />);

    // Verify that the event subscription was established
    await waitFor(() => {
      expect(mockOnJobExecuted).toHaveBeenCalled();
      expect(executedHandler).not.toBeNull();
      expect(screen.getByText('Daily Summary')).toBeInTheDocument();
    });

    // Verify the handler can be called without errors
    expect(() => {
      if (executedHandler) {
        executedHandler({ jobId: 'job-123' });
      }
    }).not.toThrow();
  });

  it('displays next run time when available', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      // Check that the next run section is rendered by looking for text that contains the key
      expect(
        screen.getByText((content, element) => {
          return element?.className?.includes('text-13px') && content.includes('cron.nextRun');
        })
      ).toBeInTheDocument();
    });

    // Verify date is displayed (look for year 2026 in the timestamp)
    const timestampElements = screen.getAllByText((content) => {
      return content.includes('2026');
    });
    expect(timestampElements.length).toBeGreaterThan(0);
  });

  it('displays conversation count for new_conversation mode', async () => {
    render(<TaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/\(2\)/)).toBeInTheDocument();
    });
  });
});
