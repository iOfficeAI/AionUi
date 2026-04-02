import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

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

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- dynamic import after mocks
type Mod = typeof import('@/renderer/pages/conversation/Messages/components/MessageCronTrigger');
const { default: MessageCronTrigger } = await vi.importActual<Mod>(
  '@/renderer/pages/conversation/Messages/components/MessageCronTrigger'
);

function buildMessage(cronJobId: string, cronJobName: string) {
  return {
    content: { cronJobId, cronJobName },
  } as Parameters<typeof MessageCronTrigger>[0]['message'];
}

describe('MessageCronTrigger', () => {
  it('renders the cron job name in the trigger card', () => {
    render(<MessageCronTrigger message={buildMessage('job-1', 'Daily Backup')} />);

    expect(screen.getByText('cron.trigger.runScheduledTask:Daily Backup')).toBeTruthy();
  });

  it('clicking the card navigates to the scheduled task detail page', () => {
    render(<MessageCronTrigger message={buildMessage('job-42', 'Nightly Sync')} />);

    fireEvent.click(screen.getByText('cron.trigger.runScheduledTask:Nightly Sync'));
    expect(mockNavigate).toHaveBeenCalledWith('/scheduled/job-42');
  });

  it('renders the correct navigation path with cronJobId', () => {
    render(<MessageCronTrigger message={buildMessage('abc-123', 'Weekly Report')} />);

    fireEvent.click(screen.getByText('cron.trigger.runScheduledTask:Weekly Report'));
    expect(mockNavigate).toHaveBeenCalledWith('/scheduled/abc-123');
  });
});
