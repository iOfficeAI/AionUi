/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CronStatusTag from '@/renderer/pages/cron/ScheduledTasksPage/CronStatusTag';
import type { ICronJob } from '@/common/adapter/ipcBridge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockJob = (overrides?: Partial<ICronJob>): ICronJob => ({
  id: 'job-1',
  enabled: true,
  schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily' },
  action: { command: 'test' },
  state: {
    last_status: 'success',
    last_run_at_ms: Date.now(),
    next_run_at_ms: Date.now() + 86400000,
  },
  metadata: {
    conversation_id: 'conv-1',
    created_at_ms: Date.now(),
  },
  ...overrides,
});

describe('CronStatusTag', () => {
  it('renders active status for enabled job with success', () => {
    const job = mockJob();
    render(<CronStatusTag job={job} />);
    expect(screen.getByText('cron.status.active')).toBeInTheDocument();
  });

  it('renders paused status for disabled job', () => {
    const job = mockJob({ enabled: false });
    render(<CronStatusTag job={job} />);
    expect(screen.getByText('cron.status.paused')).toBeInTheDocument();
  });

  it('renders error status for job with error last_status', () => {
    const job = mockJob({ state: { last_status: 'error' } as any });
    render(<CronStatusTag job={job} />);
    expect(screen.getByText('cron.status.error')).toBeInTheDocument();
  });

  it('renders error status for job with missed last_status', () => {
    const job = mockJob({ state: { last_status: 'missed' } as any });
    render(<CronStatusTag job={job} />);
    expect(screen.getByText('cron.status.error')).toBeInTheDocument();
  });

  it('renders paused status even if error when disabled', () => {
    const job = mockJob({ enabled: false, state: { last_status: 'error' } as any });
    render(<CronStatusTag job={job} />);
    expect(screen.getByText('cron.status.paused')).toBeInTheDocument();
  });

  it('renders Tag component with correct props', () => {
    const job = mockJob();
    const { container } = render(<CronStatusTag job={job} />);
    const tag = container.querySelector('.arco-tag');
    expect(tag).toBeInTheDocument();
  });
});
