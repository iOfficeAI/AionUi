/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  quitAndInstallMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      key === 'settings.updateReadyInstall' ? `${params?.version} 已就绪, 立即安装` : key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    autoUpdate: {
      quitAndInstall: {
        invoke: mocks.quitAndInstallMock,
      },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => null,
}));

import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

describe('AboutModalContent update ready state', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '2.1.13');
    mocks.quitAndInstallMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('replaces check update with ready-to-install when an update package is ready', async () => {
    render(<AboutModalContent />);

    expect(screen.getByRole('button', { name: 'settings.checkForUpdates' })).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('aionui-update-ready-state-changed', {
          detail: {
            ready: true,
            version: '2.1.14',
          },
        })
      );
    });

    fireEvent.click(await screen.findByRole('button', { name: '2.1.14 已就绪, 立即安装' }));

    expect(mocks.quitAndInstallMock).toHaveBeenCalledTimes(1);
  });
});
