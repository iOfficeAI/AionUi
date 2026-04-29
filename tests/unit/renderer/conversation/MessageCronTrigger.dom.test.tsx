import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ICronTriggerArtifact } from '@/common/adapter/ipcBridge';

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) => key + (opts?.name ? `:${opts.name}` : ''),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@icon-park/react', () => ({
  AlarmClock: () => <span data-testid='icon-alarm-clock' />,
  Right: () => <span data-testid='icon-right' />,
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: { secondary: '#666' },
}));

import MessageCronTrigger from '@/renderer/pages/conversation/Messages/components/MessageCronTrigger';

function buildArtifact(payload: unknown): ICronTriggerArtifact {
  return {
    id: 'artifact-cron-trigger',
    conversation_id: 'conv-1',
    cron_job_id: 'job-1',
    kind: 'cron_trigger',
    status: 'active',
    payload: payload as ICronTriggerArtifact['payload'],
    created_at: 1000,
    updated_at: 1000,
  };
}

describe('MessageCronTrigger', () => {
  it('renders the cron job name in the trigger card', () => {
    render(
      <MessageCronTrigger
        artifact={buildArtifact({ cron_job_id: 'job-1', cron_job_name: 'Daily Backup', triggered_at: 1000 })}
      />
    );

    expect(screen.getByTestId('message-cron-trigger')).toBeInTheDocument();
    expect(screen.getByText('cron.trigger.runScheduledTask:Daily Backup')).toBeTruthy();
  });

  it('clicking the card navigates to the scheduled task detail page', () => {
    render(
      <MessageCronTrigger
        artifact={buildArtifact({ cron_job_id: 'job-42', cron_job_name: 'Nightly Sync', triggered_at: 1000 })}
      />
    );

    fireEvent.click(screen.getByText('cron.trigger.runScheduledTask:Nightly Sync'));
    expect(mockNavigate).toHaveBeenCalledWith('/scheduled/job-42');
  });

  it('renders the correct navigation path with cron_job_id', () => {
    render(
      <MessageCronTrigger
        artifact={buildArtifact({ cron_job_id: 'abc-123', cron_job_name: 'Weekly Report', triggered_at: 1000 })}
      />
    );

    fireEvent.click(screen.getByText('cron.trigger.runScheduledTask:Weekly Report'));
    expect(mockNavigate).toHaveBeenCalledWith('/scheduled/abc-123');
  });

  it('supports camelCase cron trigger payloads', () => {
    render(
      <MessageCronTrigger
        artifact={buildArtifact({ cronJobId: 'job-camel', cronJobName: 'Camel Task', triggeredAt: 1000 })}
      />
    );

    fireEvent.click(screen.getByText('cron.trigger.runScheduledTask:Camel Task'));
    expect(mockNavigate).toHaveBeenCalledWith('/scheduled/job-camel');
  });

  it('supports persisted string cron trigger payloads', () => {
    render(
      <MessageCronTrigger
        artifact={buildArtifact(
          JSON.stringify({ cron_job_id: 'job-json', cron_job_name: 'JSON Task', triggered_at: 1000 })
        )}
      />
    );

    fireEvent.click(screen.getByText('cron.trigger.runScheduledTask:JSON Task'));
    expect(mockNavigate).toHaveBeenCalledWith('/scheduled/job-json');
  });
});
