import { fireEvent, render, screen } from '@testing-library/react';
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
    mockNavigate.mockReset();
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: false,
      hasJobs: false,
    });
    mockGetJobStatusFlags.mockReturnValue({ hasError: false, isPaused: false });
  });

  it('shows the cron entry panel when no jobs exist and loading is complete', () => {
    render(<CronJobManager conversationId='conv-1' />);

    expect(screen.getByTestId('arco-popover')).toBeInTheDocument();
    expect(screen.getByText('cron.panel.entryHint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cron.panel.openPanelButton' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
  });

  it('opens the scheduled tasks panel from the entry action button', () => {
    render(<CronJobManager conversationId='conv-1' />);

    fireEvent.click(screen.getByRole('button', { name: 'cron.panel.openPanelButton' }));

    expect(mockNavigate).toHaveBeenCalledWith('/scheduled');
  });

  it('shows job status when jobs exist', () => {
    const job = makeMockJob();
    mockUseCronJobs.mockReturnValue({
      jobs: [job],
      loading: false,
      hasJobs: true,
    });

    render(<CronJobManager conversationId='conv-1' />);

    expect(screen.getByTestId('arco-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alarm-clock')).toBeInTheDocument();
    expect(screen.queryByTestId('arco-popover')).not.toBeInTheDocument();
    expect(screen.getByTestId('arco-tooltip')).toHaveAttribute('data-tooltip-content', 'Test Job');
  });

  it('shows the paused tooltip state when the cron job is paused', () => {
    const job = makeMockJob();
    mockUseCronJobs.mockReturnValue({
      jobs: [job],
      loading: false,
      hasJobs: true,
    });
    mockGetJobStatusFlags.mockReturnValue({ hasError: false, isPaused: true });

    render(<CronJobManager conversationId='conv-1' />);

    expect(screen.getByTestId('arco-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('arco-tooltip')).toHaveAttribute('data-tooltip-content', 'cron.status.paused');
  });

  it('returns null during loading with no job', () => {
    mockUseCronJobs.mockReturnValue({
      jobs: [],
      loading: true,
      hasJobs: false,
    });

    const { container } = render(<CronJobManager conversationId='conv-1' />);

    expect(container.innerHTML).toBe('');
  });
});
