import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Down: ({ className, onClick }: { className?: string; onClick?: (e: React.MouseEvent) => void }) => (
    <span data-testid='icon-down' className={className} onClick={onClick} />
  ),
  Right: ({ className, onClick }: { className?: string; onClick?: (e: React.MouseEvent) => void }) => (
    <span data-testid='icon-right' className={className} onClick={onClick} />
  ),
}));

// Mock CronJobSiderItem component to isolate section behavior
vi.mock('@/renderer/components/layout/Sider/CronJobSiderItem', () => ({
  default: ({ job }: { job: { id: string; name: string } }) => (
    <div data-testid={`cron-job-item-${job.id}`}>{job.name}</div>
  ),
}));

import type { ICronJob } from '@/common/adapter/ipcBridge';
import CronJobSiderSection from '@/renderer/components/layout/Sider/CronJobSiderSection';

describe('CronJobSiderSection', () => {
  const mockOnNavigate = vi.fn();

  const mockJobs: ICronJob[] = [
    {
      id: 'job-1',
      name: 'Daily Summary',
      enabled: true,
      schedule: '0 9 * * *',
      target: {
        executionMode: 'new_conversation',
        newConversation: {
          modelKey: 'claude-3-5-sonnet',
          prompt: 'Summarize',
        },
      },
      metadata: {
        conversationId: 'conv-123',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      state: {
        lastRunAtMs: 0,
        nextRunAtMs: 0,
        lastStatus: 'pending',
      },
    },
    {
      id: 'job-2',
      name: 'Weekly Report',
      enabled: true,
      schedule: '0 0 * * 0',
      target: {
        executionMode: 'new_conversation',
        newConversation: {
          modelKey: 'claude-3-5-sonnet',
          prompt: 'Report',
        },
      },
      metadata: {
        conversationId: 'conv-456',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      state: {
        lastRunAtMs: 0,
        nextRunAtMs: 0,
        lastStatus: 'pending',
      },
    },
    {
      id: 'job-3',
      name: 'Monthly Review',
      enabled: true,
      schedule: '0 0 1 * *',
      target: {
        executionMode: 'new_conversation',
        newConversation: {
          modelKey: 'claude-3-5-sonnet',
          prompt: 'Review',
        },
      },
      metadata: {
        conversationId: 'conv-789',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      state: {
        lastRunAtMs: 0,
        nextRunAtMs: 0,
        lastStatus: 'pending',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when jobs array is empty', () => {
    const { container } = render(<CronJobSiderSection jobs={[]} pathname='/' onNavigate={mockOnNavigate} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when jobs array is empty', () => {
    render(<CronJobSiderSection jobs={[]} pathname='/' onNavigate={mockOnNavigate} />);
    expect(screen.queryByText('cron.scheduledTasks')).not.toBeInTheDocument();
  });

  it('renders section header with correct label', () => {
    render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);
    expect(screen.getByText('cron.scheduledTasks')).toBeInTheDocument();
  });

  it('does not render job items when collapsed by default', () => {
    render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);

    expect(screen.queryByTestId('cron-job-item-job-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cron-job-item-job-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cron-job-item-job-3')).not.toBeInTheDocument();
  });

  it('renders all job items once expanded', () => {
    render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);

    // Default is collapsed — click to expand
    const header = screen.getByText('cron.scheduledTasks').closest('div');
    fireEvent.click(header!);

    const jobItems = screen.getAllByTestId(/cron-job-item-/);
    expect(jobItems).toHaveLength(3);
    expect(screen.getByTestId('cron-job-item-job-1')).toBeInTheDocument();
    expect(screen.getByTestId('cron-job-item-job-2')).toBeInTheDocument();
    expect(screen.getByTestId('cron-job-item-job-3')).toBeInTheDocument();
  });

  it('expands and shows child items when header is clicked', () => {
    render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);

    // Initially collapsed
    expect(screen.queryByTestId('cron-job-item-job-1')).not.toBeInTheDocument();

    // Click header to expand
    const header = screen.getByText('cron.scheduledTasks').closest('div');
    expect(header).toBeInTheDocument();
    fireEvent.click(header!);

    // Items should now be visible
    expect(screen.getByTestId('cron-job-item-job-1')).toBeInTheDocument();
    expect(screen.getByTestId('cron-job-item-job-2')).toBeInTheDocument();
    expect(screen.getByTestId('cron-job-item-job-3')).toBeInTheDocument();
  });

  it('collapses and hides child items when header is clicked again', () => {
    render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);

    const header = screen.getByText('cron.scheduledTasks').closest('div');
    expect(header).toBeInTheDocument();

    // Expand
    fireEvent.click(header!);
    expect(screen.getByTestId('cron-job-item-job-1')).toBeInTheDocument();

    // Collapse again
    fireEvent.click(header!);
    expect(screen.queryByTestId('cron-job-item-job-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cron-job-item-job-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cron-job-item-job-3')).not.toBeInTheDocument();
  });

  it('shows Right icon when collapsed (default)', () => {
    render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);
    expect(screen.getByTestId('icon-right')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-down')).not.toBeInTheDocument();
  });

  it('shows Down icon when expanded', () => {
    render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);

    const header = screen.getByText('cron.scheduledTasks').closest('div');
    fireEvent.click(header!);

    expect(screen.getByTestId('icon-down')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-right')).not.toBeInTheDocument();
  });

  it('toggles visibility multiple times correctly', () => {
    render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);

    const header = screen.getByText('cron.scheduledTasks').closest('div');
    expect(header).toBeInTheDocument();

    // Initial state: collapsed
    expect(screen.queryByTestId('cron-job-item-job-1')).not.toBeInTheDocument();

    // First expand
    fireEvent.click(header!);
    expect(screen.getByTestId('cron-job-item-job-1')).toBeInTheDocument();

    // First collapse
    fireEvent.click(header!);
    expect(screen.queryByTestId('cron-job-item-job-1')).not.toBeInTheDocument();

    // Second expand
    fireEvent.click(header!);
    expect(screen.getByTestId('cron-job-item-job-1')).toBeInTheDocument();

    // Second collapse
    fireEvent.click(header!);
    expect(screen.queryByTestId('cron-job-item-job-1')).not.toBeInTheDocument();
  });

  it('renders single job correctly when expanded', () => {
    const singleJob = [mockJobs[0]];
    render(<CronJobSiderSection jobs={singleJob} pathname='/' onNavigate={mockOnNavigate} />);

    // Expand first
    const header = screen.getByText('cron.scheduledTasks').closest('div');
    fireEvent.click(header!);

    expect(screen.getByTestId('cron-job-item-job-1')).toBeInTheDocument();
    expect(screen.queryByTestId('cron-job-item-job-2')).not.toBeInTheDocument();
  });

  it('passes pathname and onNavigate props to child items when expanded', () => {
    const testPathname = '/scheduled/job-1';
    render(<CronJobSiderSection jobs={mockJobs} pathname={testPathname} onNavigate={mockOnNavigate} />);

    // Section auto-expands when pathname starts with /scheduled/, no click needed
    expect(screen.getByTestId('cron-job-item-job-1')).toBeInTheDocument();
  });

  it('maintains correct structure with mb-8px wrapper', () => {
    const { container } = render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.className).toContain('mb-8px');
  });

  it('header has correct styling classes', () => {
    const { container } = render(<CronJobSiderSection jobs={mockJobs} pathname='/' onNavigate={mockOnNavigate} />);

    const header = container.querySelector('.group.flex.items-center');
    expect(header).toBeInTheDocument();
    expect(header?.className).toContain('cursor-pointer');
    expect(header?.className).toContain('select-none');
    expect(header?.className).toContain('sticky');
  });
});
