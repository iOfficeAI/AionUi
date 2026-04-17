import { render, screen } from '@testing-library/react';
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: false,
      hasJobs: false,
    });
    mockGetJobStatusFlags.mockReturnValue({ hasError: false, isPaused: false });
  });

  it('returns null when hasCronSkill=false and no jobs', () => {
    const { container } = render(<CronJobManager conversationId='conv-1' hasCronSkill={false} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows unconfigured state when hasCronSkill=true (default) and no jobs', () => {
    render(<CronJobManager conversationId='conv-1' />);

    // Should render the Popover with create button
    expect(screen.getByTestId('arco-popover')).toBeInTheDocument();
    expect(screen.getByText('cron.status.createNow')).toBeInTheDocument();
    expect(screen.getByText('cron.status.unconfiguredHint')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
  });

  it('shows unconfigured state when hasCronSkill is explicitly true and no jobs', () => {
    render(<CronJobManager conversationId='conv-1' hasCronSkill={true} />);

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

    render(<CronJobManager conversationId='conv-1' hasCronSkill={false} />);

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

    render(<CronJobManager conversationId='conv-1' hasCronSkill={true} />);

    expect(screen.getByTestId('arco-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
  });

  it('returns null during loading with no job', () => {
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: true,
      hasJobs: false,
    });

    const { container } = render(<CronJobManager conversationId='conv-1' />);

    // loading=true and no job -> the component hits `if (loading || !job) return null`
    expect(container.innerHTML).toBe('');
  });

  it('returns null when hasCronSkill=false, no jobs, and not loading', () => {
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: false,
      hasJobs: false,
    });

    const { container } = render(<CronJobManager conversationId='conv-1' hasCronSkill={false} />);

    expect(container.innerHTML).toBe('');
  });
});
