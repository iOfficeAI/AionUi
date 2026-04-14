import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'cron.panel.entryHint') return 'Create or manage scheduled tasks';
      if (key === 'cron.panel.openPanelButton') return 'Open scheduled tasks';
      return key;
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      getJob: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/pages/cron/useCronJobs', () => ({
  useCronJobs: () => ({
    jobs: [],
    loading: false,
    hasJobs: false,
  }),
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    disabled: '#999',
    primary: '#1677ff',
  },
}));

vi.mock('@icon-park/react', () => ({
  AlarmClock: () => <span data-testid='icon-alarm-clock' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Popover: ({ children, content }: { children: React.ReactNode; content: React.ReactNode; [key: string]: unknown }) => (
    <div>
      {content}
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode; [key: string]: unknown }) => <div>{children}</div>,
}));

const { default: CronJobManager } = await vi.importActual<
  typeof import('@/renderer/pages/cron/components/CronJobManager')
>('@/renderer/pages/cron/components/CronJobManager');

describe('CronJobManager', () => {
  it('opens the unified scheduled tasks page when no job exists yet', () => {
    render(<CronJobManager conversationId='conv-1' />);

    fireEvent.click(screen.getByText('Open scheduled tasks'));

    expect(mockNavigate).toHaveBeenCalledWith('/scheduled');
  });
});
