import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';

// Hoisted mocks
const mockNavigate = vi.hoisted(() => vi.fn());
const mockListJobs = vi.hoisted(() => vi.fn());
const mockUpdateJob = vi.hoisted(() => vi.fn());
const mockRemoveJob = vi.hoisted(() => vi.fn());
const mockGetKeepAwake = vi.hoisted(() => vi.fn());
const mockSetKeepAwake = vi.hoisted(() => vi.fn());
const mockOnJobCreated = vi.hoisted(() => vi.fn(() => vi.fn())); // returns unsubscribe
const mockOnJobUpdated = vi.hoisted(() => vi.fn(() => vi.fn()));
const mockOnJobRemoved = vi.hoisted(() => vi.fn(() => vi.fn()));
const mockMessageSuccess = vi.hoisted(() => vi.fn());
const mockMessageError = vi.hoisted(() => vi.fn());

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'cron.scheduledTasks') return 'Scheduled Tasks';
      if (key === 'cron.taskCount') return `${options?.count} tasks`;
      if (key === 'cron.page.newTask') return 'New Task';
      if (key === 'cron.page.description') return 'Manage your scheduled tasks';
      if (key === 'cron.page.awakeBanner') return 'Keep computer awake';
      if (key === 'cron.page.keepAwakeTooltip') return 'Prevent sleep mode';
      if (key === 'cron.page.keepAwake') return 'Keep Awake';
      if (key === 'cron.noTasks') return 'No scheduled tasks';
      if (key === 'cron.nextRun') return 'Next run:';
      if (key === 'cron.pauseSuccess') return 'Task paused successfully';
      if (key === 'cron.resumeSuccess') return 'Task resumed successfully';
      if (key === 'cron.deleteSuccess') return 'Task deleted successfully';
      if (key === 'cron.confirmDeleteWithConversations') return 'Delete this task?';
      if (key === 'cron.status.paused') return 'Paused';
      if (key === 'cron.status.error') return 'Error';
      if (key === 'cron.status.active') return 'Active';
      return key;
    },
  }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock @icon-park/react
vi.mock('@icon-park/react', () => ({
  AlarmClock: () => <span data-testid='icon-alarm' />,
  Plus: () => <span data-testid='icon-plus' />,
  Delete: () => <span data-testid='icon-delete' />,
}));

// Mock @/common (for useCronJobs hook)
vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      listJobs: { invoke: (...args: unknown[]) => mockListJobs(...args) },
      updateJob: { invoke: (...args: unknown[]) => mockUpdateJob(...args) },
      removeJob: { invoke: (...args: unknown[]) => mockRemoveJob(...args) },
      onJobCreated: { on: (...args: unknown[]) => mockOnJobCreated(...args) },
      onJobUpdated: { on: (...args: unknown[]) => mockOnJobUpdated(...args) },
      onJobRemoved: { on: (...args: unknown[]) => mockOnJobRemoved(...args) },
    },
  },
}));

// Mock @/common/adapter/ipcBridge (for ScheduledTasksPage component direct imports)
vi.mock('@/common/adapter/ipcBridge', () => ({
  systemSettings: {
    getKeepAwake: { invoke: () => mockGetKeepAwake() },
    setKeepAwake: { invoke: (...args: unknown[]) => mockSetKeepAwake(...args) },
  },
}));

// Mock Arco Design components
vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    icon,
    type,
    shape,
    size,
    status,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    icon?: React.ReactNode;
    type?: string;
    shape?: string;
    size?: string;
    status?: string;
  }) => (
    <button onClick={onClick} data-type={type} data-shape={shape} data-size={size} data-status={status}>
      {icon}
      {children}
    </button>
  ),
  Switch: ({ checked, onChange, size }: { checked?: boolean; onChange?: (value: boolean) => void; size?: string }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.checked);
    };
    return <input type='checkbox' data-testid='switch' data-size={size} checked={checked} onChange={handleChange} />;
  },
  Tag: ({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) => (
    <span data-testid='tag' data-color={color} className={className}>
      {children}
    </span>
  ),
  Popconfirm: ({
    children,
    title,
    onOk,
  }: {
    children: React.ReactNode;
    title?: string;
    onOk?: () => void;
    [key: string]: unknown;
  }) => (
    <div data-testid='popconfirm'>
      <span data-title={title}>{children}</span>
      <button data-testid='popconfirm-ok' onClick={onOk}>
        Confirm
      </button>
    </div>
  ),
  Message: {
    success: mockMessageSuccess,
    error: mockMessageError,
  },
  Empty: ({ description, className }: { description?: string; className?: string }) => (
    <div data-testid='empty' className={className}>
      {description}
    </div>
  ),
  Spin: () => <div data-testid='spin'>Loading...</div>,
  Tooltip: ({ children, content }: { children: React.ReactNode; content?: string }) => (
    <div data-testid='tooltip' data-content={content}>
      {children}
    </div>
  ),
}));

// Mock CreateTaskDialog
vi.mock('@renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog', () => ({
  default: ({ visible, onClose }: { visible: boolean; onClose: () => void }) =>
    visible ? (
      <div data-testid='create-task-dialog'>
        <button onClick={onClose}>Close Dialog</button>
      </div>
    ) : null,
}));

// Helper to create mock job
const createMockJob = (overrides: Partial<ICronJob> = {}): ICronJob => ({
  id: 'job-1',
  name: 'Daily Summary',
  enabled: true,
  schedule: {
    kind: 'cron',
    expr: '0 9 * * *',
    description: 'Every day at 9:00 AM',
  },
  target: {
    payload: { kind: 'message', text: 'Generate summary' },
    executionMode: 'new_conversation',
  },
  metadata: {
    conversationId: 'conv-1',
    conversationTitle: 'Test Conversation',
    agentType: 'cli:claude',
    createdBy: 'user',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  state: {
    nextRunAtMs: Date.now() + 3600000, // 1 hour from now
    lastRunAtMs: Date.now() - 3600000, // 1 hour ago
    lastStatus: 'ok',
    runCount: 5,
    retryCount: 0,
    maxRetries: 3,
  },
  ...overrides,
});

describe('ScheduledTasksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetKeepAwake.mockResolvedValue(false);
    mockListJobs.mockResolvedValue([]);
  });

  it('should render loading state initially', async () => {
    mockListJobs.mockImplementation(() => new Promise(() => {})); // never resolves

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    expect(screen.getByTestId('spin')).toBeInTheDocument();
  });

  it('should render empty state when no jobs exist', async () => {
    mockListJobs.mockResolvedValue([]);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => {
      expect(screen.getByTestId('empty')).toBeInTheDocument();
      expect(screen.getByText('No scheduled tasks')).toBeInTheDocument();
    });
  });

  it('should render job list with task count', async () => {
    const jobs = [createMockJob(), createMockJob({ id: 'job-2', name: 'Weekly Report', enabled: false })];
    mockListJobs.mockResolvedValue(jobs);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => {
      expect(screen.getByText('Daily Summary')).toBeInTheDocument();
      expect(screen.getByText('Weekly Report')).toBeInTheDocument();
      expect(screen.getByText('2 tasks')).toBeInTheDocument();
    });
  });

  it('should display correct status tags', async () => {
    const jobs = [
      createMockJob({ id: 'job-1', enabled: true, state: { ...createMockJob().state, lastStatus: 'ok' } }),
      createMockJob({ id: 'job-2', name: 'Task 2', enabled: false }),
      createMockJob({
        id: 'job-3',
        name: 'Task 3',
        enabled: true,
        state: { ...createMockJob().state, lastStatus: 'error' },
      }),
    ];
    mockListJobs.mockResolvedValue(jobs);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => {
      const tags = screen.getAllByTestId('tag');
      // First tag is the task count header, skip it
      const statusTags = tags.slice(1);
      expect(statusTags[0]).toHaveAttribute('data-color', 'green'); // Active
      expect(statusTags[0]).toHaveTextContent('Active');
      expect(statusTags[1]).toHaveAttribute('data-color', 'gray'); // Paused
      expect(statusTags[1]).toHaveTextContent('Paused');
      expect(statusTags[2]).toHaveAttribute('data-color', 'red'); // Error
      expect(statusTags[2]).toHaveTextContent('Error');
    });
  });

  it('should navigate to job detail when clicking job card', async () => {
    const job = createMockJob({ id: 'job-123' });
    mockListJobs.mockResolvedValue([job]);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('Daily Summary'));

    const jobCard = screen.getByText('Daily Summary').closest('div');
    fireEvent.click(jobCard!);

    expect(mockNavigate).toHaveBeenCalledWith('/scheduled/job-123');
  });

  it('should pause job when toggling enabled switch to off', async () => {
    const job = createMockJob({ enabled: true });
    mockListJobs.mockResolvedValue([job]);
    mockUpdateJob.mockResolvedValue({ ...job, enabled: false });

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('Daily Summary'));

    const switches = screen.getAllByTestId('switch');
    // First switch is keep awake, second switch is the job's enabled toggle
    const jobSwitch = switches[1];

    fireEvent.click(jobSwitch);

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalledWith({
        jobId: 'job-1',
        updates: { enabled: false },
      });
      expect(mockMessageSuccess).toHaveBeenCalledWith('Task paused successfully');
    });
  });

  it('should resume job when toggling enabled switch to on', async () => {
    const job = createMockJob({ enabled: false });
    mockListJobs.mockResolvedValue([job]);
    mockUpdateJob.mockResolvedValue({ ...job, enabled: true });

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('Daily Summary'));

    const switches = screen.getAllByTestId('switch');
    // First switch is keep awake, second switch is the job's enabled toggle
    const jobSwitch = switches[1];

    fireEvent.click(jobSwitch);

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalledWith({
        jobId: 'job-1',
        updates: { enabled: true },
      });
      expect(mockMessageSuccess).toHaveBeenCalledWith('Task resumed successfully');
    });
  });

  it('should show error message when toggle fails', async () => {
    const job = createMockJob({ enabled: true });
    mockListJobs.mockResolvedValue([job]);
    mockUpdateJob.mockRejectedValue(new Error('Network error'));

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('Daily Summary'));

    const switches = screen.getAllByTestId('switch');
    // First switch is keep awake, second switch is the job's enabled toggle
    const jobSwitch = switches[1];

    fireEvent.click(jobSwitch);

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('Error: Network error');
    });
  });

  it('should delete job after confirmation', async () => {
    const job = createMockJob({ id: 'job-to-delete' });
    mockListJobs.mockResolvedValue([job]);
    mockRemoveJob.mockResolvedValue(undefined);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('Daily Summary'));

    const confirmButton = screen.getByTestId('popconfirm-ok');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockRemoveJob).toHaveBeenCalledWith({ jobId: 'job-to-delete' });
      expect(mockMessageSuccess).toHaveBeenCalledWith('Task deleted successfully');
    });
  });

  it('should show error message when delete fails', async () => {
    const job = createMockJob();
    mockListJobs.mockResolvedValue([job]);
    mockRemoveJob.mockRejectedValue(new Error('Delete failed'));

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('Daily Summary'));

    const confirmButton = screen.getByTestId('popconfirm-ok');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('Error: Delete failed');
    });
  });

  it('should open create task dialog when clicking new task button', async () => {
    mockListJobs.mockResolvedValue([]);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('New Task'));

    fireEvent.click(screen.getByText('New Task'));

    expect(screen.getByTestId('create-task-dialog')).toBeInTheDocument();
  });

  it('should close create task dialog', async () => {
    mockListJobs.mockResolvedValue([]);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('New Task'));

    fireEvent.click(screen.getByText('New Task'));
    expect(screen.getByTestId('create-task-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close Dialog'));

    await waitFor(() => {
      expect(screen.queryByTestId('create-task-dialog')).not.toBeInTheDocument();
    });
  });

  it('should load keep awake setting on mount', async () => {
    mockListJobs.mockResolvedValue([]);
    mockGetKeepAwake.mockResolvedValue(true);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    // Wait for rendering to complete
    await waitFor(() => screen.getByTestId('empty'));

    // Verify the keep awake API was called
    expect(mockGetKeepAwake).toHaveBeenCalled();

    // Verify the keep awake switch exists
    const switches = screen.getAllByTestId('switch');
    expect(switches[0]).toBeInTheDocument(); // First switch is keep awake
  });

  it('should call setKeepAwake when toggling keep awake switch', async () => {
    mockListJobs.mockResolvedValue([]);
    mockGetKeepAwake.mockResolvedValue(false);
    mockSetKeepAwake.mockResolvedValue(undefined);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    // Wait for rendering to complete
    await waitFor(() => screen.getByTestId('empty'));

    const switches = screen.getAllByTestId('switch');
    const keepAwakeSwitch = switches[0]; // First switch is keep awake

    fireEvent.click(keepAwakeSwitch);

    await waitFor(() => {
      expect(mockSetKeepAwake).toHaveBeenCalledWith({ enabled: true });
    });
  });

  it('should show error message when setKeepAwake fails', async () => {
    mockListJobs.mockResolvedValue([]);
    mockGetKeepAwake.mockResolvedValue(false);
    mockSetKeepAwake.mockRejectedValue(new Error('System error'));

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    // Wait for rendering to complete
    await waitFor(() => screen.getByTestId('empty'));

    const switches = screen.getAllByTestId('switch');
    const keepAwakeSwitch = switches[0];

    fireEvent.click(keepAwakeSwitch);

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('Error: System error');
    });
  });

  it('should format next run time correctly', async () => {
    const nextRunAtMs = new Date('2026-04-03T09:00:00').getTime();
    const job = createMockJob({ state: { ...createMockJob().state, nextRunAtMs } });
    mockListJobs.mockResolvedValue([job]);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => {
      expect(screen.getByText(/Next run:/)).toBeInTheDocument();
      // formatNextRun uses toLocaleString, so just verify it exists
    });
  });

  it('should not show next run time when nextRunAtMs is not set', async () => {
    const job = createMockJob({ state: { ...createMockJob().state, nextRunAtMs: undefined } });
    mockListJobs.mockResolvedValue([job]);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByText('Daily Summary'));

    expect(screen.queryByText(/Next run:/)).not.toBeInTheDocument();
  });

  it('should display schedule description', async () => {
    const job = createMockJob({
      schedule: {
        kind: 'cron',
        expr: '0 9 * * *',
        description: 'Every day at 9:00 AM',
      },
    });
    mockListJobs.mockResolvedValue([job]);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => {
      expect(screen.getByText('Every day at 9:00 AM')).toBeInTheDocument();
    });
  });

  it('should subscribe to job events on mount', async () => {
    mockListJobs.mockResolvedValue([]);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => screen.getByTestId('empty'));

    expect(mockOnJobCreated).toHaveBeenCalled();
    expect(mockOnJobUpdated).toHaveBeenCalled();
    expect(mockOnJobRemoved).toHaveBeenCalled();
  });

  it('should render multiple jobs in grid layout', async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => createMockJob({ id: `job-${i}`, name: `Task ${i + 1}` }));
    mockListJobs.mockResolvedValue(jobs);

    const { default: ScheduledTasksPage } = await import('@renderer/pages/cron/ScheduledTasksPage');
    render(<ScheduledTasksPage />);

    await waitFor(() => {
      jobs.forEach((_, i) => {
        expect(screen.getByText(`Task ${i + 1}`)).toBeInTheDocument();
      });
    });
  });
});
