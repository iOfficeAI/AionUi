/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated', ready: true }),
}));

vi.mock('@/renderer/hooks/context/NewApiAccountContext', () => ({
  useNewApiAccount: () => ({ ready: true, isLoggedIn: false }),
}));

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader' />,
}));

vi.mock('@renderer/pages/login', () => ({
  default: () => <div data-testid='web-login-page' />,
}));

vi.mock('@renderer/pages/guid', () => ({
  default: () => <div data-testid='guid-page' />,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    HashRouter: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Navigate: ({ to }: { to: string }) => <div data-testid='navigate' data-to={to} />,
    Route: ({ element }: { element?: React.ReactNode }) => <>{element}</>,
    Routes: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

import Router from '@/renderer/components/layout/Router';

describe('desktop router login flow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not render the web login page for desktop runtime', () => {
    render(<Router layout={<div data-testid='layout-shell' />} />);

    expect(screen.queryByTestId('web-login-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('layout-shell')).toBeInTheDocument();
  });
});
