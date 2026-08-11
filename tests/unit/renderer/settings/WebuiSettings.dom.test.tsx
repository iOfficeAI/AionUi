/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: {
    id: 'admin-1',
    username: 'admin',
    role: 'admin' as 'admin' | 'member',
    status: 'active' as const,
    must_change_password: false,
  } as {
    id: string;
    username: string;
    role: 'admin' | 'member';
    status: 'active' | 'disabled';
    must_change_password: boolean;
  } | null,
}));

const platformMocks = vi.hoisted(() => ({
  isElectronDesktop: vi.fn(() => false),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@icon-park/react', () => ({
  Communication: () => <span>channels-icon</span>,
  History: () => <span>audit-icon</span>,
  Peoples: () => <span>users-icon</span>,
  Share: () => <span>share-icon</span>,
  User: () => <span>account-icon</span>,
  Lock: () => <span>lock-icon</span>,
  Logout: () => <span>logout-icon</span>,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    logout: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => platformMocks.isElectronDesktop(),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageHeader', () => ({
  default: ({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/WebuiModalContent', () => ({
  default: () => <div data-testid='webui-modal-content'>channels-panel</div>,
}));

vi.mock('@/renderer/pages/settings/WebuiSettings/UsersPanel', () => ({
  default: () => <div data-testid='users-panel'>users-panel</div>,
}));

vi.mock('@/renderer/pages/settings/WebuiSettings/CollaborationPanel', () => ({
  default: () => <div data-testid='collaboration-panel'>collaboration-panel</div>,
}));

vi.mock('@/renderer/pages/settings/WebuiSettings/AuditPanel', () => ({
  default: () => <div data-testid='audit-panel'>audit-panel</div>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

import WebuiSettings from '@/renderer/pages/settings/WebuiSettings';

describe('WebuiSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformMocks.isElectronDesktop.mockReturnValue(false);
    authState.user = {
      id: 'admin-1',
      username: 'admin',
      role: 'admin',
      status: 'active',
      must_change_password: false,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders desktop WebUI modal content only on Electron', () => {
    platformMocks.isElectronDesktop.mockReturnValue(true);
    render(<WebuiSettings />);
    expect(screen.getByTestId('webui-modal-content')).toBeInTheDocument();
    expect(screen.queryByText('settings.account.title')).not.toBeInTheDocument();
  });

  it('shows admin account tabs and only mounts the active panel', () => {
    render(<WebuiSettings />);

    expect(screen.getByText('settings.account.title')).toBeInTheDocument();
    expect(screen.getByText('settings.account.tabs.users')).toBeInTheDocument();
    expect(screen.getByText('settings.account.tabs.collaboration')).toBeInTheDocument();
    expect(screen.getByText('settings.account.tabs.audit')).toBeInTheDocument();
    expect(screen.getByText('settings.account.tabs.channels')).toBeInTheDocument();

    // Default tab is account overview.
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.queryByTestId('users-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('settings.account.tabs.users'));
    expect(screen.getByTestId('users-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('settings.account.tabs.collaboration'));
    expect(screen.getByTestId('collaboration-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('settings.account.tabs.audit'));
    expect(screen.getByTestId('audit-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('settings.account.tabs.channels'));
    expect(screen.getByTestId('webui-modal-content')).toBeInTheDocument();
  });

  it('hides admin-only tabs for members', () => {
    authState.user = {
      id: 'user-2',
      username: 'bob',
      role: 'member',
      status: 'active',
      must_change_password: false,
    };

    render(<WebuiSettings />);

    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByText('settings.account.tabs.users')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.account.tabs.audit')).not.toBeInTheDocument();
    expect(screen.getByText('settings.account.tabs.collaboration')).toBeInTheDocument();
  });

  it('shows feature unavailable when there is no authenticated user', () => {
    authState.user = null;
    render(<WebuiSettings />);
    expect(screen.getByText('settings.account.errors.featureUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('settings.account.tabs.collaboration')).not.toBeInTheDocument();
  });
});
