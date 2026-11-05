/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/common/types/channel/channel';
import type { GoogleModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGoogleModelSelection';
import TelegramConfigForm from '@/renderer/components/settings/SettingsModal/contents/channels/TelegramConfigForm';

const mocks = vi.hoisted(() => ({
  getPendingPairings: vi.fn(),
  getAuthorizedUsers: vi.fn(),
  getPlatformSettings: vi.fn(),
  getPluginStatus: vi.fn(),
  testPlugin: vi.fn(),
  enablePlugin: vi.fn(),
  approvePairing: vi.fn(),
  rejectPairing: vi.fn(),
  revokeUser: vi.fn(),
  setAssistantSetting: vi.fn(),
  pairingRequestedOn: vi.fn(() => () => {}),
  userAuthorizedOn: vi.fn(() => () => {}),
  assistantsList: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  channel: {
    getPendingPairings: { invoke: mocks.getPendingPairings },
    getAuthorizedUsers: { invoke: mocks.getAuthorizedUsers },
    getPlatformSettings: { invoke: mocks.getPlatformSettings },
    getPluginStatus: { invoke: mocks.getPluginStatus },
    testPlugin: { invoke: mocks.testPlugin },
    enablePlugin: { invoke: mocks.enablePlugin },
    approvePairing: { invoke: mocks.approvePairing },
    rejectPairing: { invoke: mocks.rejectPairing },
    revokeUser: { invoke: mocks.revokeUser },
    setAssistantSetting: { invoke: mocks.setAssistantSetting },
    pairingRequested: { on: mocks.pairingRequestedOn },
    userAuthorized: { on: mocks.userAuthorizedOn },
  },
  assistants: {
    list: { invoke: mocks.assistantsList },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) => (typeof options === 'string' ? options : key),
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { ...actual.Message, success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
  };
});

vi.mock('@/renderer/pages/conversation/platforms/gemini/GoogleModelSelector', () => ({
  default: () => null,
}));

const enabledPluginStatus: IChannelPluginStatus = {
  id: 'telegram_default',
  type: 'telegram',
  name: 'Telegram',
  enabled: true,
  connected: true,
  activeUsers: 1,
  botUsername: 'test_bot',
};

const pendingPairing: IChannelPairingRequest = {
  code: '123456',
  platformUserId: '999',
  platformType: 'telegram',
  display_name: 'Second User',
  requestedAt: Date.now(),
  expiresAt: Date.now() + 10 * 60 * 1000,
};

const authorizedUser: IChannelUser = {
  id: 'user-1',
  platformUserId: '111',
  platformType: 'telegram',
  display_name: 'First User',
  authorizedAt: Date.now() - 60 * 1000,
};

const modelSelection = {
  providers: [],
  formatModelLabel: () => '',
  getDisplayModelName: (modelName?: string) => modelName ?? '',
  getAvailableModels: () => [],
  handleSelectModel: vi.fn(),
} as unknown as GoogleModelSelection;

function renderForm() {
  return render(
    <ConfigProvider>
      <TelegramConfigForm pluginStatus={enabledPluginStatus} modelSelection={modelSelection} onStatusChange={vi.fn()} />
    </ConfigProvider>
  );
}

describe('TelegramConfigForm pending pairings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPendingPairings.mockResolvedValue([pendingPairing]);
    mocks.getAuthorizedUsers.mockResolvedValue([authorizedUser]);
    mocks.getPlatformSettings.mockResolvedValue({ assistant: undefined });
    mocks.assistantsList.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows pending pairing requests even when a user is already authorized', async () => {
    renderForm();

    expect(await screen.findByText('Pending Pairing Requests')).toBeTruthy();
    expect(await screen.findByText('Second User')).toBeTruthy();
    expect(screen.getByText(/123456/)).toBeTruthy();
    expect(screen.getByText('First User')).toBeTruthy();
  });

  it('approves a pending pairing via the channel bridge', async () => {
    mocks.approvePairing.mockResolvedValue(undefined);
    renderForm();

    fireEvent.click(await screen.findByText('Approve'));

    await waitFor(() => {
      expect(mocks.approvePairing).toHaveBeenCalledWith({ code: '123456' });
    });
  });

  it('rejects a pending pairing via the channel bridge', async () => {
    mocks.rejectPairing.mockResolvedValue(undefined);
    renderForm();

    fireEvent.click(await screen.findByText('Reject'));

    await waitFor(() => {
      expect(mocks.rejectPairing).toHaveBeenCalledWith({ code: '123456' });
    });
  });

  it('still shows pending pairings when no user is authorized yet', async () => {
    mocks.getAuthorizedUsers.mockResolvedValue([]);
    renderForm();

    expect(await screen.findByText('Pending Pairing Requests')).toBeTruthy();
    expect(await screen.findByText('Second User')).toBeTruthy();
  });
});
