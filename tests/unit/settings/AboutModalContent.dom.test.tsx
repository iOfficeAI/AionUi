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

  it('shows the branded application identity without public update controls', () => {
    render(<AboutModalContent />);

    expect(screen.getByText('CSBU WorkMate')).toBeInTheDocument();
    expect(screen.getByText('settings.appDescription')).toBeInTheDocument();
    expect(screen.getByText('settings.producer')).toBeInTheDocument();
    expect(screen.getByText('v2.1.44')).toBeInTheDocument();
    expect(screen.queryByText('settings.checkForUpdates')).not.toBeInTheDocument();
  });

  it('opens the feedback report from the bug report action', () => {
    render(<AboutModalContent />);

    fireEvent.click(screen.getByText('settings.bugReport'));

    expect(screen.getByTestId('feedback-report-modal')).toBeInTheDocument();
  });
});
