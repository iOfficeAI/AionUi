/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: ({ visible }: { visible: boolean }) => (visible ? <div data-testid='feedback-report-modal' /> : null),
}));

import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

describe('AboutModalContent', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '2.1.44');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the branded application identity with a visible update entry', () => {
    render(<AboutModalContent />);

    expect(screen.getByText('CSBU WorkMate')).toBeInTheDocument();
    expect(screen.getByText('settings.appDescription')).toBeInTheDocument();
    expect(screen.getByText('settings.producer')).toBeInTheDocument();
    expect(screen.getByText('v2.1.44')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.checkForUpdates' })).toBeInTheDocument();
  });

  it('opens the update notification when the update entry is clicked', () => {
    const openListener = vi.fn();
    window.addEventListener('csbu-workmate-open-update-modal', openListener);
    render(<AboutModalContent />);

    fireEvent.click(screen.getByRole('button', { name: 'settings.checkForUpdates' }));

    expect(openListener).toHaveBeenCalledOnce();
    const [event] = openListener.mock.calls[0]!;
    expect((event as CustomEvent).detail).toEqual({ source: 'about' });
    window.removeEventListener('csbu-workmate-open-update-modal', openListener);
  });

  it('opens the feedback report from the bug report action', () => {
    render(<AboutModalContent />);

    fireEvent.click(screen.getByText('settings.bugReport'));

    expect(screen.getByTestId('feedback-report-modal')).toBeInTheDocument();
  });
});
