import { render, screen } from '@testing-library/react';
import React from 'react';
import { Outlet } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}));

vi.mock('@/renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader' />,
}));

vi.mock('@/renderer/pages/cron/ScheduledTasksPage', () => ({
  default: () => <div data-testid='scheduled-page'>Scheduled</div>,
}));

vi.mock('@/renderer/pages/cron/ScheduledTasksPage/TaskDetailPage', () => ({
  default: () => <div data-testid='task-detail-page'>Task Detail</div>,
}));

import PanelRoute from '@/renderer/components/layout/Router';

const LayoutShell: React.FC = () => <Outlet />;

describe('PanelRoute scheduled task redirect', () => {
  beforeEach(() => {
    window.location.hash = '#/guid';
  });

  it('redirects the legacy settings cron route to the unified scheduled tasks page', async () => {
    window.location.hash = '#/settings/cron';

    render(<PanelRoute layout={<LayoutShell />} />);

    expect(await screen.findByTestId('scheduled-page')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/scheduled');
  });
});
