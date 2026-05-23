/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const navigate = vi.fn();

vi.mock('@renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'unauthenticated', login: vi.fn() }),
}));

vi.mock('@renderer/hooks/context/NewApiAccountContext', () => ({
  useNewApiAccount: () => ({
    ready: true,
    isLoggedIn: false,
    login: vi.fn(),
  }),
}));

vi.mock('@renderer/components/layout/PoundingInteractiveLogo', () => ({
  default: () => <div data-testid='logo' />,
}));

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='loader' />,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

import LoginPage from '@/renderer/pages/login';

describe('LoginPage desktop contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not duplicate managed CLI prep progress on desktop login page', () => {
    render(<LoginPage />);

    expect(screen.queryByTestId('managed-cli-prep-progress')).not.toBeInTheDocument();
  });
});
