/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import BrowserNotificationGrant from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/BrowserNotificationGrant';

const setNotification = (permission: NotificationPermission | null, secure = true) => {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  if (permission === null) {
    delete (globalThis as unknown as { Notification?: unknown }).Notification;
  } else {
    (globalThis as unknown as { Notification: unknown }).Notification = {
      permission,
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    };
  }
};

afterEach(() => {
  cleanup();
});

describe('BrowserNotificationGrant', () => {
  it('shows the enable button when permission is default', () => {
    setNotification('default');
    render(<BrowserNotificationGrant />);
    expect(screen.getByText('settings.browserNotification.enable')).toBeInTheDocument();
  });

  it('shows the granted state when already granted', () => {
    setNotification('granted');
    render(<BrowserNotificationGrant />);
    expect(screen.getByText('settings.browserNotification.granted')).toBeInTheDocument();
  });

  it('shows the denied state when permission is denied', () => {
    setNotification('denied');
    render(<BrowserNotificationGrant />);
    expect(screen.getByText('settings.browserNotification.denied')).toBeInTheDocument();
  });

  it('shows the insecure-context hint when not a secure context', () => {
    setNotification('default', false);
    render(<BrowserNotificationGrant />);
    expect(screen.getByText('settings.browserNotification.insecureContext')).toBeInTheDocument();
  });

  it('requests permission when the enable button is clicked', async () => {
    setNotification('default');
    const requestSpy = (globalThis as unknown as { Notification: { requestPermission: ReturnType<typeof vi.fn> } })
      .Notification.requestPermission;
    render(<BrowserNotificationGrant />);
    await userEvent.click(screen.getByText('settings.browserNotification.enable'));
    expect(requestSpy).toHaveBeenCalled();
  });
});
