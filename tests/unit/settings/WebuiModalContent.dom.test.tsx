/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';
import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';

const { mockGetStatus, mockStatusChangedOn } = vi.hoisted(() => ({
  mockGetStatus: vi.fn(),
  mockStatusChangedOn: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  shell: {
    openExternal: { invoke: vi.fn() },
  },
  webui: {
    getStatus: { invoke: mockGetStatus },
    start: { invoke: vi.fn() },
    stop: { invoke: vi.fn() },
    statusChanged: { on: mockStatusChangedOn },
    changePassword: { invoke: vi.fn() },
    changeUsername: { invoke: vi.fn() },
    resetPassword: { invoke: vi.fn() },
    generateQRToken: { invoke: vi.fn() },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(() => false),
    set: vi.fn(),
  },
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    children,
    visible,
    title,
    onCancel,
  }: {
    children?: React.ReactNode;
    visible?: boolean;
    title?: React.ReactNode;
    onCancel?: () => void;
  }) =>
    visible ? (
      <div role='dialog' aria-label={String(title)}>
        <button type='button' aria-label='mock.close' onClick={onCancel}>
          close
        </button>
        {children}
      </div>
    ) : null,
}));

const renderWebuiModalContent = () =>
  render(
    <ConfigProvider>
      <WebuiModalContent />
    </ConfigProvider>
  );

describe('WebuiModalContent password modal focus order', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mockGetStatus.mockResolvedValue({
      running: true,
      port: 25808,
      allowRemote: false,
      localUrl: 'http://localhost:25808',
      adminUsername: 'admin',
      initialPassword: undefined,
    });
    mockStatusChangedOn.mockReturnValue(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const openPasswordModal = async (user: ReturnType<typeof userEvent.setup>) => {
    renderWebuiModalContent();

    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled());
    await screen.findAllByText('WebUI');
    const editPasswordButton = screen.getByRole('button', { name: 'settings.webui.resetPassword' });
    await user.click(editPasswordButton);
  };

  it('moves focus from the new password input directly to the confirm password input when pressing Tab', async () => {
    const user = userEvent.setup();
    await openPasswordModal(user);

    const newPasswordInput = screen.getByPlaceholderText('settings.webui.newPasswordPlaceholder');
    const confirmPasswordInput = screen.getByPlaceholderText('settings.webui.confirmPasswordPlaceholder');

    await user.click(newPasswordInput);
    await user.keyboard('a');
    expect(newPasswordInput).toHaveFocus();
    expect(newPasswordInput).toHaveValue('a');

    await user.tab();

    expect(confirmPasswordInput).toHaveFocus();
  });

  it('keeps the new password visibility toggle keyboard accessible after the direct Tab jump', async () => {
    const user = userEvent.setup();
    await openPasswordModal(user);

    const newPasswordInput = screen.getByPlaceholderText('settings.webui.newPasswordPlaceholder');
    const confirmPasswordInput = screen.getByPlaceholderText('settings.webui.confirmPasswordPlaceholder');
    const visibilityToggle = screen.getAllByRole('button', { name: 'login.showPassword' })[0];
    const confirmVisibilityToggle = screen.getAllByRole('button', { name: 'login.showPassword' })[1];

    await user.click(newPasswordInput);
    await user.tab();
    expect(confirmPasswordInput).toHaveFocus();

    await user.tab({ shift: true });
    expect(visibilityToggle).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(newPasswordInput).toHaveAttribute('type', 'text');
    expect(visibilityToggle).toHaveAccessibleName('login.hidePassword');

    await user.click(confirmVisibilityToggle);
    expect(confirmPasswordInput).toHaveAttribute('type', 'text');
    expect(confirmVisibilityToggle).toHaveAccessibleName('login.hidePassword');
  });

  it('resets password visibility when the password modal closes', async () => {
    const user = userEvent.setup();
    await openPasswordModal(user);

    const newPasswordInput = screen.getByPlaceholderText('settings.webui.newPasswordPlaceholder');
    const visibilityToggle = screen.getAllByRole('button', { name: 'login.showPassword' })[0];

    await user.click(visibilityToggle);
    expect(newPasswordInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'mock.close' }));
    await user.click(screen.getByRole('button', { name: 'settings.webui.resetPassword' }));

    expect(screen.getByPlaceholderText('settings.webui.newPasswordPlaceholder')).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: 'login.showPassword' })[0]).toBeInTheDocument();
  });
});
