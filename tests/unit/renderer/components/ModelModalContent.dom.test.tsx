/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  getModelConfig: vi.fn(),
  saveModelConfig: vi.fn(),
  quotaStatus: vi.fn(),
  translations: {
    'settings.model': 'Models',
    'settings.clearStatus': 'Clear Status',
    'settings.addModel': 'Add Model',
    'settings.customModelSupportNote': 'Custom model note',
    'settings.noConfiguredModels': 'No configured models',
    'settings.needHelpConfigGuide': 'Need help',
    'settings.configGuide': 'Guide',
    'settings.configGuideSuffix': '.',
    'settings.modelCount': 'Models',
    'settings.apiKeyCount': 'API Keys',
    'settings.accountQuotaUnavailable': 'Account quota unavailable',
    'settings.chatgptAuthLoggedOut': 'Not connected',
    'conversation.aionrs.plan': 'Plan',
    'conversation.aionrs.unlimitedCredits': 'Unlimited',
  } as Record<string, string>,
  t(key: string) {
    return state.translations[key] || key;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: state.t,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      getModelConfig: {
        invoke: state.getModelConfig,
      },
      saveModelConfig: {
        invoke: state.saveModelConfig,
      },
    },
    chatgptAuth: {
      quotaStatus: {
        invoke: state.quotaStatus,
      },
    },
    conversation: {
      responseStream: {
        on: vi.fn(() => () => {}),
      },
      create: { invoke: vi.fn() },
      sendMessage: { invoke: vi.fn() },
      remove: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@icon-park/react', () => ({
  DeleteFour: () => <span data-testid='delete-icon' />,
  Heartbeat: () => <span data-testid='health-icon' />,
  Info: () => <span data-testid='info-icon' />,
  Minus: () => <span data-testid='minus-icon' />,
  Plus: () => <span data-testid='plus-icon' />,
  Write: () => <span data-testid='write-icon' />,
}));

vi.mock('@arco-design/web-react', () => {
  const MessageApi = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  };

  const Collapse = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  Collapse.Item = ({ header, children }: React.PropsWithChildren<{ header: React.ReactNode }>) => (
    <section>
      <div>{header}</div>
      <div>{children}</div>
    </section>
  );

  return {
    Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button onClick={onClick} type='button'>
        {children}
      </button>
    ),
    Collapse,
    Divider: () => <hr />,
    Message: {
      useMessage: () => [MessageApi, <div key='message-context' />],
      error: MessageApi.error,
      info: MessageApi.info,
      success: MessageApi.success,
    },
    Popconfirm: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Switch: ({ checked }: { checked?: boolean }) => <input checked={checked} readOnly role='switch' type='checkbox' />,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

vi.mock('@/renderer/pages/settings/components/AddModelModal', () => ({
  default: {
    useModal: () => [{ open: vi.fn(), close: vi.fn() }, null],
  },
}));

vi.mock('@/renderer/pages/settings/components/AddPlatformModal', () => ({
  default: {
    useModal: () => [{ open: vi.fn(), close: vi.fn() }, null],
  },
}));

vi.mock('@/renderer/pages/settings/components/EditModeModal', () => ({
  default: {
    useModal: () => [{ open: vi.fn(), close: vi.fn() }, null],
  },
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

vi.mock('@/renderer/hooks/system/useDeepLink', () => ({
  consumePendingDeepLink: () => null,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/healthCheckUtils', () => ({
  classifyHealthCheckMessage: vi.fn(),
  getHealthCheckConversationType: vi.fn(() => 'aionrs'),
}));

describe('ModelModalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.getModelConfig.mockResolvedValue([
      {
        id: 'chatgpt-provider',
        name: 'ChatGPT',
        platform: 'chatgpt',
        baseUrl: 'https://chatgpt.com',
        apiKey: '',
        model: ['gpt-5-codex'],
      },
    ]);
    state.saveModelConfig.mockResolvedValue({ success: true });
    state.quotaStatus.mockResolvedValue({
      success: true,
      data: {
        authenticated: true,
        accountLimits: {
          plan_type: 'pro',
          limits: [
            {
              limit_id: 'codex',
              primary: {
                used_percent: 45,
                window_minutes: 300,
              },
              secondary: {
                used_percent: 30,
                window_minutes: 10_080,
              },
              credits: {
                has_credits: true,
                unlimited: false,
                balance: '38',
              },
            },
          ],
        },
      },
    });
  });

  it('shows ChatGPT account quota tags in the provider header', async () => {
    const { default: ModelModalContent } =
      await import('@/renderer/components/settings/SettingsModal/contents/ModelModalContent');

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ModelModalContent />
      </SWRConfig>
    );

    await waitFor(() => {
      expect(screen.getByText('Plan: Pro')).toBeInTheDocument();
    });

    expect(screen.getByText('5h 55%')).toBeInTheDocument();
    expect(screen.getByText('Weekly 70%')).toBeInTheDocument();
    expect(screen.getByText('38 credits')).toBeInTheDocument();
    expect(state.quotaStatus).toHaveBeenCalledWith({
      model: 'gpt-5-codex',
      proxy: undefined,
    });
  });

  it('renders quota tags from /status --chatgpt fallback text when capabilities are unavailable', async () => {
    state.quotaStatus.mockResolvedValue({
      success: true,
      data: {
        authenticated: true,
        statusText: [
          'Status (ChatGPT)',
          'Model: gpt-5-codex',
          'Plan: Pro',
          '5h limit: 55% left (45% used)',
          'Weekly limit: 70% left (30% used)',
          'Credits: 38 credits',
        ].join('\n'),
      },
    });

    const { default: ModelModalContent } =
      await import('@/renderer/components/settings/SettingsModal/contents/ModelModalContent');

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ModelModalContent />
      </SWRConfig>
    );

    await waitFor(() => {
      expect(screen.getByText('Plan: Pro')).toBeInTheDocument();
    });

    expect(screen.getByText('5h 55%')).toBeInTheDocument();
    expect(screen.getByText('Weekly 70%')).toBeInTheDocument();
    expect(screen.getByText('38 credits')).toBeInTheDocument();
  });
});
