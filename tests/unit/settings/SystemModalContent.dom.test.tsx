/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';
import { SWRConfig } from 'swr';

const { systemInfoMock, updateSystemInfoMock, restartMock, showOpenMock, messageInfoMock, configServiceMock } =
  vi.hoisted(() => ({
    systemInfoMock: vi.fn(),
    updateSystemInfoMock: vi.fn(),
    restartMock: vi.fn(),
    showOpenMock: vi.fn(),
    messageInfoMock: vi.fn(),
    configServiceMock: {
      get: vi.fn(() => undefined),
      set: vi.fn(() => Promise.resolve()),
      setLocal: vi.fn(),
    },
  }));
const clientBusinessSettingsMocks = vi.hoisted(() => ({
  getClientBusinessSetting: vi.fn(),
  setClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/base/FeedbackButton', () => ({
  default: () => <button type='button'>settings.oneClickFeedback</button>,
}));

vi.mock('@/renderer/components/settings/LanguageSwitcher', () => ({
  default: () => <div>LanguageSwitcher</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/DevSettings', () => ({
  default: () => <div>DevSettings</div>,
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: clientBusinessSettingsMocks.getClientBusinessSetting,
  setClientBusinessSetting: clientBusinessSettingsMocks.setClientBusinessSetting,
  removeClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/common/config/configService', () => ({
  configService: configServiceMock,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      systemInfo: { invoke: systemInfoMock },
      updateSystemInfo: { invoke: updateSystemInfoMock },
      restart: { invoke: restartMock },
      getStartOnBootStatus: { invoke: vi.fn(() => Promise.resolve({ success: false })) },
      getGpuStatus: { invoke: vi.fn(() => Promise.resolve({ success: false })) },
    },
    systemSettings: {
      getCloseToTray: { invoke: vi.fn(() => Promise.resolve(false)) },
      setCloseToTray: { invoke: vi.fn(() => Promise.resolve()) },
    },
    dialog: {
      showOpen: { invoke: showOpenMock },
    },
    shell: {
      openFolderWith: { invoke: vi.fn(() => Promise.resolve()) },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      info: messageInfoMock,
    },
    Modal: {
      ...actual.Modal,
      useModal: () => [
        {
          confirm: ({ onOk }: { onOk?: () => void }) => {
            onOk?.();
          },
        },
        null,
      ],
    },
  };
});

import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';

const defaultSystemInfo = {
  cacheDir: '/cache',
  workDir: '/work',
  logDir: '/logs',
  platform: 'darwin',
  arch: 'arm64',
};

const renderContent = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConfigProvider>
        <SystemModalContent />
      </ConfigProvider>
    </SWRConfig>
  );

describe('SystemModalContent directory settings', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    configServiceMock.get.mockImplementation(() => undefined);
    configServiceMock.set.mockResolvedValue(undefined);
    clientBusinessSettingsMocks.getClientBusinessSetting.mockImplementation(async (key: string) => {
      if (key === 'acp.promptTimeout') return undefined;
      if (key === 'acp.agentIdleTimeout') return undefined;
      return undefined;
    });
    clientBusinessSettingsMocks.setClientBusinessSetting.mockResolvedValue(undefined);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    systemInfoMock.mockResolvedValue(defaultSystemInfo);
    updateSystemInfoMock.mockResolvedValue(undefined);
    restartMock.mockResolvedValue({ restarted: true, manualRestartRequired: false });
    showOpenMock.mockResolvedValue(['/new-logs']);
  });

  it('persists a selected log directory and restarts with the updated directory config', async () => {
    const user = userEvent.setup();
    const { container } = renderContent();

    await screen.findByText('/logs');
    const logDirItem = screen.getByText('settings.logDir').closest('.arco-form-item');
    expect(logDirItem).not.toBeNull();

    const pickButton = within(logDirItem as HTMLElement).getByRole('button');
    await user.click(pickButton);

    await waitFor(() => {
      expect(updateSystemInfoMock).toHaveBeenCalledWith({
        cacheDir: '/cache',
        workDir: '/work',
        logDir: '/new-logs',
      });
    });
    expect(restartMock).toHaveBeenCalledTimes(1);
    expect(container).toHaveTextContent('/new-logs');
  });

  it('shows the update failure reason when changing a directory fails', async () => {
    const user = userEvent.setup();
    updateSystemInfoMock.mockRejectedValueOnce(new Error('permission denied'));
    showOpenMock.mockResolvedValueOnce(['/new-work']);
    const { container } = renderContent();

    await screen.findByText('/work');
    const workDirItem = screen.getByText('settings.workDir').closest('.arco-form-item');
    expect(workDirItem).not.toBeNull();

    await user.click(within(workDirItem as HTMLElement).getByRole('button'));

    await screen.findByText('permission denied');
    expect(container).toHaveTextContent('/work');
    expect(restartMock).not.toHaveBeenCalled();
  });

  it('opens the directory picker when clicking the work directory field body', async () => {
    const user = userEvent.setup();
    showOpenMock.mockResolvedValueOnce(['/new-work']);
    renderContent();

    await screen.findByText('/work');
    const workDirItem = screen.getByText('settings.workDir').closest('.arco-form-item');
    expect(workDirItem).not.toBeNull();
    const fieldBody = (workDirItem as HTMLElement).querySelector('.aion-dir-input');
    expect(fieldBody).not.toBeNull();

    await user.click(fieldBody as HTMLElement);

    await waitFor(() => {
      expect(updateSystemInfoMock).toHaveBeenCalledWith({
        cacheDir: '/cache',
        workDir: '/new-work',
        logDir: '/logs',
      });
    });
  });

  it('tells the user to restart manually when dev mode cannot relaunch automatically', async () => {
    const user = userEvent.setup();
    restartMock.mockResolvedValueOnce({ restarted: false, manualRestartRequired: true, reason: 'dev-mode' });
    const { container } = renderContent();

    await screen.findByText('/logs');
    const logDirItem = screen.getByText('settings.logDir').closest('.arco-form-item');
    expect(logDirItem).not.toBeNull();

    await user.click(within(logDirItem as HTMLElement).getByRole('button'));

    await waitFor(() => {
      expect(updateSystemInfoMock).toHaveBeenCalledWith({
        cacheDir: '/cache',
        workDir: '/work',
        logDir: '/new-logs',
      });
    });
    expect(restartMock).toHaveBeenCalledTimes(1);
    expect(messageInfoMock).toHaveBeenCalledWith('settings.restartManualRequired');
    expect(container).toHaveTextContent('/new-logs');
  });

  it('shows field-specific tooltip text when hovering the folder action button', async () => {
    const user = userEvent.setup();
    renderContent();

    await screen.findByText('/work');
    const workDirItem = screen.getByText('settings.workDir').closest('.arco-form-item');
    const logDirItem = screen.getByText('settings.logDir').closest('.arco-form-item');
    expect(workDirItem).not.toBeNull();
    expect(logDirItem).not.toBeNull();

    const workDirButton = within(workDirItem as HTMLElement).getByRole('button');
    const logDirButton = within(logDirItem as HTMLElement).getByRole('button');

    await user.hover(workDirButton);
    expect(await screen.findByText('settings.changeWorkDir')).toBeInTheDocument();

    await user.unhover(workDirButton);
    await user.hover(logDirButton);
    expect(await screen.findByText('settings.changeLogDir')).toBeInTheDocument();
  });

  it('loads ACP timeouts from backend client settings', async () => {
    clientBusinessSettingsMocks.getClientBusinessSetting.mockImplementation(async (key: string) => {
      if (key === 'acp.promptTimeout') return 640;
      if (key === 'acp.agentIdleTimeout') return 9;
      return undefined;
    });

    renderContent();

    expect(await screen.findByDisplayValue('640')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('9')).toBeInTheDocument();
  });

  it('does not fall back to legacy configService ACP timeout keys', async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'acp.promptTimeout') return 777;
      if (key === 'acp.agentIdleTimeout') return 13;
      return undefined;
    });

    renderContent();

    expect(await screen.findByDisplayValue('300')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('5')).toBeInTheDocument();
    expect(configServiceMock.get).not.toHaveBeenCalledWith('acp.promptTimeout');
    expect(configServiceMock.get).not.toHaveBeenCalledWith('acp.agentIdleTimeout');
  });

  it('persists ACP timeout changes through backend client settings', async () => {
    const user = userEvent.setup();
    renderContent();

    const timeoutInputs = await screen.findAllByRole('spinbutton');
    const promptTimeoutInput = timeoutInputs[0];
    const agentIdleTimeoutInput = timeoutInputs[1];

    await user.clear(promptTimeoutInput);
    await user.type(promptTimeoutInput, '450');
    fireEvent.blur(promptTimeoutInput);

    await waitFor(() => {
      expect(clientBusinessSettingsMocks.setClientBusinessSetting).toHaveBeenCalledWith('acp.promptTimeout', 450);
    });

    await user.clear(agentIdleTimeoutInput);
    await user.type(agentIdleTimeoutInput, '7');
    fireEvent.blur(agentIdleTimeoutInput);

    await waitFor(() => {
      expect(clientBusinessSettingsMocks.setClientBusinessSetting).toHaveBeenCalledWith('acp.agentIdleTimeout', 7);
    });
  });
});
