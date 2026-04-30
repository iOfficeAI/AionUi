import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseCronJobs = vi.hoisted(() =>
  vi.fn(() => ({
    jobs: [],
    loading: false,
    hasJobs: false,
    refetch: vi.fn(async () => {}),
  }))
);
const mockGetJobStatusFlags = vi.hoisted(() =>
  vi.fn(() => ({
    hasError: false,
    isPaused: false,
  }))
);
const mockListJobsInvoke = vi.hoisted(() => vi.fn(async () => []));
const mockBindConversationInvoke = vi.hoisted(() => vi.fn(async () => ({})));
const mockUnbindConversationInvoke = vi.hoisted(() => vi.fn(async () => undefined));
const mockMessageSuccess = vi.hoisted(() => vi.fn());
const mockMessageError = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params?.count ? `${key}:${params.count}` : key),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    loading,
    onClick,
    ...props
  }: {
    children?: React.ReactNode;
    icon?: React.ReactNode;
    loading?: boolean;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button data-loading={loading ? 'true' : 'false'} onClick={onClick} {...props}>
      {icon}
      {children}
    </button>
  ),
  Empty: ({ description, className }: { description?: React.ReactNode; className?: string }) => (
    <div className={className}>{description}</div>
  ),
  Message: {
    success: (...args: unknown[]) => mockMessageSuccess(...args),
    error: (...args: unknown[]) => mockMessageError(...args),
  },
  Popover: ({ children, content }: { children?: React.ReactNode; content?: React.ReactNode }) => (
    <div data-testid='arco-popover'>
      {content}
      {children}
    </div>
  ),
  Tooltip: ({ children, content }: { children?: React.ReactNode; content?: React.ReactNode }) => (
    <div data-testid='arco-tooltip' data-tooltip-content={typeof content === 'string' ? content : undefined}>
      {children}
    </div>
  ),
}));

vi.mock('@icon-park/react', () => ({
  AlarmClock: () => <span data-testid='icon-alarm-clock' />,
  Plus: () => <span data-testid='icon-plus' />,
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    primary: '#165DFF',
    disabled: '#86909c',
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      listJobs: { invoke: (...args: unknown[]) => mockListJobsInvoke(...args) },
      bindConversation: { invoke: (...args: unknown[]) => mockBindConversationInvoke(...args) },
      unbindConversation: { invoke: (...args: unknown[]) => mockUnbindConversationInvoke(...args) },
    },
  },
}));

vi.mock('@/renderer/pages/cron/useCronJobs', () => ({
  useCronJobs: mockUseCronJobs,
}));

vi.mock('@/renderer/pages/cron/cronUtils', () => ({
  getJobStatusFlags: mockGetJobStatusFlags,
}));

vi.mock('@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog', () => ({
  default: ({
    visible,
    conversationId,
    conversationTitle,
    agentType,
  }: {
    visible: boolean;
    conversationId?: string;
    conversationTitle?: string;
    agentType?: string;
  }) =>
    visible ? (
      <div data-testid='create-task-dialog'>
        {conversationId}|{conversationTitle}|{agentType}
      </div>
    ) : null,
}));

import type { ICronJob } from '@/common/adapter/ipcBridge';
import CronJobManager from '@/renderer/pages/cron/components/CronJobManager';

const makeMockJob = (overrides?: Partial<ICronJob>): ICronJob => ({
  id: 'job-1',
  name: 'Test Job',
  enabled: true,
  schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
  target: {
    payload: { kind: 'message', text: 'run' },
    executionMode: 'existing',
  },
  metadata: {
    conversationId: 'conv-1',
    agentType: 'claude',
    createdBy: 'user',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  state: {
    runCount: 0,
    retryCount: 0,
    maxRetries: 3,
  },
  ...overrides,
});

describe('CronJobManager', () => {
  const refetch = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: false,
      hasJobs: false,
      refetch,
    });
    mockListJobsInvoke.mockResolvedValue([]);
    mockBindConversationInvoke.mockResolvedValue({});
    mockUnbindConversationInvoke.mockResolvedValue(undefined);
    mockGetJobStatusFlags.mockReturnValue({ hasError: false, isPaused: false });
  });

  it('always shows the scheduled task entry for a conversation without bound jobs', async () => {
    render(<CronJobManager conversationId='conv-1' conversationTitle='Chat One' agentType='remote' />);

    expect(screen.getByTestId('arco-popover')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
    expect(screen.getByText('cron.binding.title')).toBeInTheDocument();
    expect(screen.getByText('cron.binding.noBoundTasks')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('cron.binding.noAvailableTasks')).toBeInTheDocument());
  });

  it('opens a create dialog with the current conversation context', () => {
    render(<CronJobManager conversationId='conv-1' conversationTitle='Chat One' agentType='remote' />);

    fireEvent.click(screen.getByText('cron.binding.createAndBind'));

    expect(screen.getByTestId('create-task-dialog')).toHaveTextContent('conv-1|Chat One|remote');
  });

  it('shows bound tasks in the tooltip summary', () => {
    mockUseCronJobs.mockReturnValue({
      jobs: [makeMockJob({ id: 'bound-job', name: 'Bound Task' })],
      loading: false,
      hasJobs: true,
      refetch,
    });

    render(<CronJobManager conversationId='conv-1' />);

    expect(screen.getByText('Bound Task')).toBeInTheDocument();
    expect(screen.getByTestId('arco-tooltip')).toHaveAttribute('data-tooltip-content', 'cron.binding.boundTaskCount:1');
  });

  it('unbinds a bound task when clicking the whole task row', async () => {
    mockUseCronJobs.mockReturnValue({
      jobs: [makeMockJob({ id: 'bound-job', name: 'Bound Task' })],
      loading: false,
      hasJobs: true,
      refetch,
    });

    render(<CronJobManager conversationId='conv-1' />);
    expect(screen.queryByText('cron.binding.unbind')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bound Task' }));

    await waitFor(() => {
      expect(mockUnbindConversationInvoke).toHaveBeenCalledWith({ jobId: 'bound-job', conversationId: 'conv-1' });
    });
    expect(mockMessageSuccess).toHaveBeenCalledWith('cron.binding.unbindSuccess');
    expect(refetch).toHaveBeenCalled();
  });

  it('binds an existing ongoing task when clicking the whole task row', async () => {
    const availableJob = makeMockJob({ id: 'available-job', name: 'Available Task' });
    mockListJobsInvoke.mockResolvedValue([availableJob]);

    render(<CronJobManager conversationId='conv-1' />);

    await waitFor(() => expect(screen.getByText('Available Task')).toBeInTheDocument());
    expect(screen.queryByText('cron.binding.bind')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Available Task' }));

    await waitFor(() => {
      expect(mockBindConversationInvoke).toHaveBeenCalledWith({ jobId: 'available-job', conversationId: 'conv-1' });
    });
    expect(mockMessageSuccess).toHaveBeenCalledWith('cron.binding.bindSuccess');
    expect(refetch).toHaveBeenCalled();
    expect(mockListJobsInvoke).toHaveBeenCalledTimes(2);
  });

  it('does not offer new-conversation tasks as bindable tasks', async () => {
    mockListJobsInvoke.mockResolvedValue([
      makeMockJob({
        id: 'new-conv-job',
        name: 'New Conversation Task',
        target: { payload: { kind: 'message', text: 'run' }, executionMode: 'new_conversation' },
      }),
    ]);

    render(<CronJobManager conversationId='conv-1' />);

    await waitFor(() => expect(screen.getByText('cron.binding.noAvailableTasks')).toBeInTheDocument());
    expect(screen.queryByText('New Conversation Task')).not.toBeInTheDocument();
  });
});
