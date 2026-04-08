import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Outlet } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}));

vi.mock('@/renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader' />,
}));

vi.mock('@/renderer/pages/guid', () => ({
  default: () => <div data-testid='guid-page'>Guid</div>,
}));

import PanelRoute from '@/renderer/components/layout/Router';

const LayoutShell: React.FC = () => <Outlet />;

describe('PanelRoute team entry guard', () => {
  beforeEach(() => {
    window.location.hash = '#/guid';
  });

  it('redirects team routes back to guid when team mode is hidden', async () => {
    window.location.hash = '#/team/team-1';

    render(<PanelRoute layout={<LayoutShell />} />);

    await waitFor(() => {
      expect(window.location.hash).toBe('#/guid');
    });

    expect(await screen.findByTestId('guid-page')).toBeInTheDocument();
  });

  it('still renders the guid route normally', async () => {
    render(<PanelRoute layout={<LayoutShell />} />);

    expect(await screen.findByTestId('guid-page')).toBeInTheDocument();
  });
});
