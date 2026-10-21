/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChannelPluginStatus } from '@/common/types/channel/channel';
import type { GoogleModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGoogleModelSelection';

const mocks = vi.hoisted(() => ({
  approvePairing: vi.fn(),
  configGet: vi.fn(),
  configSet: vi.fn(),
  enablePlugin: vi.fn(),
  getPendingPairings: vi.fn(),
  getPlatformSettings: vi.fn(),
  getPluginStatus: vi.fn(),
  listAssistants: vi.fn(),
  messageError: vi.fn(),
  messageInfo: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  rejectPairing: vi.fn(),
  testPlugin: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  assistants: { list: { invoke: mocks.listAssistants } },
  channel: {
    approvePairing: { invoke: mocks.approvePairing },
    enablePlugin: { invoke: mocks.enablePlugin },
    getPendingPairings: { invoke: mocks.getPendingPairings },
    getPlatformSettings: { invoke: mocks.getPlatformSettings },
    getPluginStatus: { invoke: mocks.getPluginStatus },
    pairingRequested: { on: vi.fn(() => vi.fn()) },
    rejectPairing: { invoke: mocks.rejectPairing },
    setAssistantSetting: { invoke: vi.fn() },
    testPlugin: { invoke: mocks.testPlugin },
    userAuthorized: { on: vi.fn(() => vi.fn()) },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mocks.configGet,
    set: mocks.configSet,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GoogleModelSelector', () => ({
  default: () => <div data-testid='model-selector' />,
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      error: mocks.messageError,
      info: mocks.messageInfo,
      success: mocks.messageSuccess,
      warning: mocks.messageWarning,
    },
  };
});

import MattermostConfigForm from '@/renderer/components/settings/SettingsModal/contents/channels/platforms/MattermostConfigForm';

const modelSelection: GoogleModelSelection = {
  providers: [],
  formatModelLabel: () => '',
  getDisplayModelName: () => '',
  getAvailableModels: () => [],
  handleSelectModel: vi.fn(() => Promise.resolve()),
};

const enabledStatus: IChannelPluginStatus = {
  id: 'mattermost',
  type: 'mattermost',
  name: 'Mattermost',
  enabled: true,
  connected: true,
  activeUsers: 1,
  hasToken: true,
};

const renderForm = (pluginStatus: IChannelPluginStatus | null = null) => {
  const onStatusChange = vi.fn();
  render(
    <MattermostConfigForm pluginStatus={pluginStatus} modelSelection={modelSelection} onStatusChange={onStatusChange} />
  );
  return { onStatusChange };
};

describe('MattermostConfigForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configGet.mockReturnValue(undefined);
    mocks.configSet.mockResolvedValue(undefined);
    mocks.enablePlugin.mockResolvedValue(undefined);
    mocks.getPendingPairings.mockResolvedValue([]);
    mocks.getPlatformSettings.mockResolvedValue({ assistant: null, default_model: null });
    mocks.getPluginStatus.mockResolvedValue([enabledStatus]);
    mocks.listAssistants.mockResolvedValue([]);
    mocks.testPlugin.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('validates required credentials before enabling the plugin', async () => {
    renderForm();

    fireEvent.click(screen.getByText('settings.mattermost.saveAndEnable'));
    expect(mocks.messageWarning).toHaveBeenCalledWith('settings.mattermost.serverUrlRequired');

    fireEvent.change(screen.getByPlaceholderText('settings.mattermost.serverUrlPlaceholder'), {
      target: { value: 'https://mattermost.example.com' },
    });
    fireEvent.click(screen.getByText('settings.mattermost.saveAndEnable'));
    expect(mocks.messageWarning).toHaveBeenCalledWith('settings.mattermost.accessTokenRequired');
    expect(mocks.enablePlugin).not.toHaveBeenCalled();
  });

  it('persists the form and refreshes status after enabling Mattermost', async () => {
    const { onStatusChange } = renderForm();
    fireEvent.change(screen.getByPlaceholderText('settings.mattermost.serverUrlPlaceholder'), {
      target: { value: ' https://mattermost.example.com/ ' },
    });
    fireEvent.change(screen.getByPlaceholderText('settings.mattermost.accessTokenPlaceholder'), {
      target: { value: ' test-token ' },
    });
    fireEvent.click(screen.getByText('settings.mattermost.saveAndEnable'));

    await waitFor(() => {
      expect(mocks.enablePlugin).toHaveBeenCalledWith({
        plugin_id: 'mattermost',
        config: {
          credentials: { accessToken: 'test-token' },
          config: {
            serverUrl: 'https://mattermost.example.com/',
            allowedChannelIds: '',
            replyInThread: true,
            ignoreSelfMessages: true,
          },
        },
      });
    });
    expect(mocks.configSet).toHaveBeenCalledWith('assistant.mattermost.config', {
      serverUrl: 'https://mattermost.example.com/',
      allowedChannelIds: '',
      replyInThread: true,
      ignoreSelfMessages: true,
    });
    expect(onStatusChange).toHaveBeenCalledWith(enabledStatus);
    expect(mocks.messageSuccess).toHaveBeenCalledWith('settings.mattermost.pluginEnabled');
  });

  it('tests credentials and reports a backend connection failure', async () => {
    mocks.testPlugin.mockResolvedValue({ success: false, error: 'invalid token' });
    renderForm();
    fireEvent.change(screen.getByPlaceholderText('settings.mattermost.serverUrlPlaceholder'), {
      target: { value: 'https://mattermost.example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('settings.mattermost.accessTokenPlaceholder'), {
      target: { value: 'bad-token' },
    });
    fireEvent.click(screen.getByText('settings.assistant.testConnection'));

    await waitFor(() => {
      expect(mocks.testPlugin).toHaveBeenCalledWith({
        plugin_id: 'mattermost',
        token: 'bad-token',
        extra_config: { serverUrl: 'https://mattermost.example.com' },
      });
    });
    expect(mocks.messageError).toHaveBeenCalledWith('invalid token');
  });

  it('loads saved settings and handles pending pairing decisions', async () => {
    mocks.configGet.mockReturnValue({
      serverUrl: 'https://saved.example.com',
      allowedChannelIds: 'channel-1',
      replyInThread: false,
      ignoreSelfMessages: false,
    });
    mocks.getPendingPairings.mockResolvedValue([
      {
        code: 'ABC123',
        platformUserId: 'user-1',
        platformType: 'mattermost',
        display_name: 'Ada',
        requestedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    ]);
    mocks.approvePairing.mockResolvedValue(undefined);
    mocks.rejectPairing.mockResolvedValue(undefined);
    renderForm(enabledStatus);

    expect(await screen.findByDisplayValue('https://saved.example.com')).toBeInTheDocument();
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('settings.mattermost.statusConnected')).toBeInTheDocument();

    fireEvent.click(screen.getByText('settings.assistant.approve'));
    await waitFor(() => expect(mocks.approvePairing).toHaveBeenCalledWith({ code: 'ABC123' }));

    fireEvent.click(screen.getByText('settings.assistant.reject'));
    await waitFor(() => expect(mocks.rejectPairing).toHaveBeenCalledWith({ code: 'ABC123' }));
  });
});
