import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ICronJob } from '@/common/adapter/ipcBridge';

const navigateMock = vi.fn();
const pauseJobMock = vi.fn().mockResolvedValue(undefined);
const resumeJobMock = vi.fn().mockResolvedValue(undefined);
const deleteJobMock = vi.fn().mockResolvedValue(undefined);
const updateJobMock = vi.fn().mockResolvedValue(undefined);
const refetchMock = vi.fn().mockResolvedValue(undefined);
const successMessageMock = vi.fn();
const errorMessageMock = vi.fn();

const JOBS: ICronJob[] = [
  {
    id: 'job-1',
    name: 'Daily summary',
    enabled: true,
    schedule: {
      kind: 'cron',
      expr: '0 9 * * *',
      description: 'Every day at 09:00',
    },
    target: {
      payload: {
        kind: 'message',
        text: 'Summarize the latest AI updates',
      },
    },
    metadata: {
      conversationId: 'conv-1',
      conversationTitle: 'Project Alpha',
      agentType: 'claude',
      createdBy: 'user',
      createdAt: 1,
      updatedAt: 1,
    },
    state: {
      nextRunAtMs: 1_700_000_000_000,
      lastRunAtMs: 1_699_999_000_000,
      lastStatus: 'ok',
      runCount: 3,
      retryCount: 0,
      maxRetries: 3,
    },
  },
  {
    id: 'job-2',
    name: 'Paused review',
    enabled: false,
    schedule: {
      kind: 'every',
      everyMs: 3_600_000,
      description: 'Hourly',
    },
    target: {
      payload: {
        kind: 'message',
        text: 'Review incoming feedback',
      },
    },
    metadata: {
      conversationId: 'conv-2',
      conversationTitle: 'Project Beta',
      agentType: 'codex',
      createdBy: 'user',
      createdAt: 1,
      updatedAt: 1,
    },
    state: {
      runCount: 0,
      retryCount: 0,
      maxRetries: 3,
    },
  },
];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'common.refresh': 'Refresh',
        'common.edit': 'Edit',
        'common.unknownError': 'Unknown error',
        'cron.allScheduledTasks': 'All Scheduled Tasks',
        'cron.taskCount': `${options?.count ?? 0} task(s)`,
        'cron.schedule': 'Schedule',
        'cron.nextRun': 'Next run',
        'cron.lastRun': 'Last run',
        'cron.lastError': 'Error',
        'cron.message': 'Message',
        'cron.pauseSuccess': 'Task paused',
        'cron.resumeSuccess': 'Task resumed',
        'cron.status.active': 'Active',
        'cron.status.paused': 'Paused',
        'cron.status.error': 'Error',
        'cron.actions.goTo': 'View Chat',
        'cron.actions.pause': 'Pause',
        'cron.actions.resume': 'Resume',
        'cron.overview.description': 'Review and manage scheduled tasks across all conversations from one place.',
        'cron.overview.stats.total': 'Total Tasks',
        'cron.overview.stats.active': 'Active Tasks',
        'cron.overview.stats.paused': 'Paused Tasks',
        'cron.overview.stats.error': 'Errored Tasks',
        'cron.overview.filters.allStatuses': 'All Statuses',
        'cron.overview.filters.searchPlaceholder': 'Search scheduled tasks',
        'cron.overview.emptyInitial': 'No scheduled tasks yet.',
        'cron.overview.emptyFiltered': 'No scheduled tasks match the current filters.',
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/pages/cron/components/CronJobDrawer', () => ({
  default: ({ job }: { job: ICronJob }) => <div data-testid='cron-job-drawer'>{job.name}</div>,
}));

vi.mock('@/renderer/pages/cron/useCronJobs', () => ({
  useAllCronJobs: () => ({
    jobs: JOBS,
    loading: false,
    refetch: refetchMock,
    pauseJob: pauseJobMock,
    resumeJob: resumeJobMock,
    deleteJob: deleteJobMock,
    updateJob: updateJobMock,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    icon,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    icon?: React.ReactNode;
  }) => (
    <button type='button' onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => <input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />,
  Message: {
    useMessage: () => [
      {
        success: successMessageMock,
        error: errorMessageMock,
      },
      <div key='message-context' />,
    ],
  },
  Select: ({
    value,
    options,
    onChange,
  }: {
    value?: string;
    options?: Array<{ label: string; value: string }>;
    onChange?: (value: string) => void;
  }) => (
    <select value={value} onChange={(event) => onChange?.(event.target.value)}>
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Spin: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Typography: {
    Title: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
    Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  },
}));

vi.mock('@icon-park/react', () => ({
  AlarmClock: () => <span data-testid='icon-alarm' />,
  ArrowRight: () => <span data-testid='icon-arrow-right' />,
  Edit: () => <span data-testid='icon-edit' />,
  Pause: () => <span data-testid='icon-pause' />,
  Play: () => <span data-testid='icon-play' />,
  Refresh: () => <span data-testid='icon-refresh' />,
  Search: () => <span data-testid='icon-search' />,
}));

import GlobalCronSettings from '@/renderer/pages/cron/GlobalCronSettings';

describe('GlobalCronSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the global cron overview and all jobs', () => {
    render(<GlobalCronSettings />);

    expect(screen.getByText('All Scheduled Tasks')).toBeInTheDocument();
    expect(screen.getByText('Daily summary')).toBeInTheDocument();
    expect(screen.getByText('Paused review')).toBeInTheDocument();
    expect(screen.getByText('2 task(s)')).toBeInTheDocument();
  });

  it('filters jobs by search query', async () => {
    render(<GlobalCronSettings />);

    fireEvent.change(screen.getByPlaceholderText('Search scheduled tasks'), {
      target: { value: 'beta' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Daily summary')).not.toBeInTheDocument();
      expect(screen.getByText('Paused review')).toBeInTheDocument();
    });
  });

  it('navigates to the conversation and pauses active jobs', async () => {
    render(<GlobalCronSettings />);

    fireEvent.click(screen.getAllByText('View Chat')[0]);
    expect(navigateMock).toHaveBeenCalledWith('/conversation/conv-1');

    fireEvent.click(screen.getAllByText('Pause')[0]);

    await waitFor(() => {
      expect(pauseJobMock).toHaveBeenCalledWith('job-1');
      expect(successMessageMock).toHaveBeenCalledWith('Task paused');
    });
  });

  it('opens the drawer for editing a selected job', async () => {
    render(<GlobalCronSettings />);

    fireEvent.click(screen.getAllByText('Edit')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('cron-job-drawer')).toHaveTextContent('Daily summary');
    });
  });
});
