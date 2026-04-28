import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseCronJobs = vi.hoisted(() =>
  vi.fn(() => ({
    jobs: [],
    loading: false,
    hasJobs: false,
  }))
);
const mockGetJobStatusFlags = vi.hoisted(() =>
  vi.fn(() => ({
    hasError: false,
    isPaused: false,
  }))
);
const mockGetJobInvoke = vi.hoisted(() => vi.fn());
const cronCreatedListeners = vi.hoisted(() => new Set<(job: ICronJob) => void>());
const cronUpdatedListeners = vi.hoisted(() => new Set<(job: ICronJob) => void>());
const cronRemovedListeners = vi.hoisted(() => new Set<(data: { job_id: string }) => void>());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button data-testid='arco-button' onClick={onClick} {...props}>
      {children}
    </button>
  ),
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
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    primary: '#165DFF',
    disabled: '#86909c',
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
    off: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      getJob: { invoke: (...args: unknown[]) => mockGetJobInvoke(...args) },
      onJobCreated: {
        on: (listener: (job: ICronJob) => void) => {
          cronCreatedListeners.add(listener);
          return () => cronCreatedListeners.delete(listener);
        },
      },
      onJobUpdated: {
        on: (listener: (job: ICronJob) => void) => {
          cronUpdatedListeners.add(listener);
          return () => cronUpdatedListeners.delete(listener);
        },
      },
      onJobRemoved: {
        on: (listener: (data: { job_id: string }) => void) => {
          cronRemovedListeners.add(listener);
          return () => cronRemovedListeners.delete(listener);
        },
      },
    },
  },
}));

// Mock using the aliased path that the component resolves to
vi.mock('@/renderer/pages/cron/useCronJobs', () => ({
  useCronJobs: mockUseCronJobs,
}));

vi.mock('@/renderer/pages/cron/cronUtils', () => ({
  getJobStatusFlags: mockGetJobStatusFlags,
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
    conversation_id: 'conv-1',
    agent_type: 'claude',
    createdBy: 'user',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  state: {
    runCount: 0,
    retryCount: 0,
    maxRetries: 3,
  },
  ...overrides,
});

describe('CronJobManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronCreatedListeners.clear();
    cronUpdatedListeners.clear();
    cronRemovedListeners.clear();
    mockGetJobInvoke.mockResolvedValue(null);
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: false,
      hasJobs: false,
    });
    mockGetJobStatusFlags.mockReturnValue({ hasError: false, isPaused: false });
  });

  it('returns null when hasCronSkill=false and no jobs', () => {
    const { container } = render(<CronJobManager conversation_id='conv-1' hasCronSkill={false} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows unconfigured state when hasCronSkill=true (default) and no jobs', () => {
    render(<CronJobManager conversation_id='conv-1' />);

    // Should render the Popover with create button
    expect(screen.getByTestId('arco-popover')).toBeInTheDocument();
    expect(screen.getByText('cron.status.createNow')).toBeInTheDocument();
    expect(screen.getByText('cron.status.unconfiguredHint')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
  });

  it('shows unconfigured state when hasCronSkill is explicitly true and no jobs', () => {
    render(<CronJobManager conversation_id='conv-1' hasCronSkill={true} />);

    expect(screen.getByTestId('arco-popover')).toBeInTheDocument();
    expect(screen.getByText('cron.status.createNow')).toBeInTheDocument();
  });

  it('shows job status when jobs exist regardless of hasCronSkill', () => {
    const job = makeMockJob();
    mockUseCronJobs.mockReturnValue({
      jobs: [job],
      loading: false,
      hasJobs: true,
    });

    render(<CronJobManager conversation_id='conv-1' hasCronSkill={false} />);

    // Should show Tooltip with job name, not Popover
    expect(screen.getByTestId('arco-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
    // Should not show the unconfigured popover
    expect(screen.queryByTestId('arco-popover')).not.toBeInTheDocument();
  });

  it('shows job status when jobs exist with hasCronSkill=true', () => {
    const job = makeMockJob();
    mockUseCronJobs.mockReturnValue({
      jobs: [job],
      loading: false,
      hasJobs: true,
    });

    render(<CronJobManager conversation_id='conv-1' hasCronSkill={true} />);

    expect(screen.getByTestId('arco-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
  });

  it('returns null during loading with no job', () => {
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: true,
      hasJobs: false,
    });

    const { container } = render(<CronJobManager conversation_id='conv-1' />);

    // loading=true and no job -> the component hits `if (loading || !job) return null`
    expect(container.innerHTML).toBe('');
  });

  it('returns null when hasCronSkill=false, no jobs, and not loading', () => {
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: false,
      hasJobs: false,
    });

    const { container } = render(<CronJobManager conversation_id='conv-1' hasCronSkill={false} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows a direct cron job when cron_job_id is provided', async () => {
    const job = makeMockJob({ id: 'job-direct' });
    mockGetJobInvoke.mockResolvedValue(job);

    render(<CronJobManager conversation_id='conv-1' cron_job_id='job-direct' hasCronSkill={false} />);

    expect(await screen.findByTestId('arco-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
  });

  it('hydrates direct cron job from a late created event', async () => {
    render(<CronJobManager conversation_id='conv-1' cron_job_id='job-late' hasCronSkill={false} />);

    expect(mockGetJobInvoke).toHaveBeenCalledWith({ job_id: 'job-late' });
    expect(screen.queryByTestId('arco-tooltip')).not.toBeInTheDocument();
    await waitFor(() => expect(cronCreatedListeners.size).toBeGreaterThan(0));

    const lateJob = makeMockJob({ id: 'job-late', name: 'Late Job' });
    await act(async () => {
      for (const listener of cronCreatedListeners) {
        listener(lateJob);
      }
    });

    expect(await screen.findByTestId('arco-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('arco-tooltip')).toHaveAttribute('data-tooltip-content', 'Late Job');
  });
});
