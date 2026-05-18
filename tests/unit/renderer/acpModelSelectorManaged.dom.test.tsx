/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';

const managedModels = ['MiniMax-M2.7-highspeed', 'mimo-v2.5', 'deepseek-v4-pro'];
let dropdownOpen = false;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/hooks/context/NewApiAccountContext', () => ({
  useNewApiAccount: () => ({
    ready: true,
    status: { loggedIn: true, baseUrl: 'https://api.mxou.cn', models: managedModels, updatedAt: Date.now() },
    isLoggedIn: true,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({
    data: [
      {
        id: 'desktop-newapi-managed-provider',
        name: 'New API',
        platform: 'new-api',
        base_url: 'https://api.mxou.cn',
        api_key: '',
        models: managedModels,
        enabled: true,
        model_enabled: Object.fromEntries(managedModels.map((modelId) => [modelId, true])),
        model_health: {},
      },
    ],
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModel: {
        invoke: vi.fn().mockResolvedValue({
          model_info: {
            current_model_id: 'default',
            current_model_label: 'Default (recommended)',
            available_models: [
              { id: 'default', label: 'Default (recommended)' },
              { id: 'opus', label: 'MiniMax-M2.7-highspeed' },
            ],
          },
        }),
      },
      setModel: { invoke: vi.fn().mockResolvedValue(undefined) },
      responseStream: { on: vi.fn(() => () => {}) },
    },
    newApiAccount: {
      reconcileModel: { invoke: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
}));

vi.mock('@/renderer/utils/model/agentTypes', () => ({
  DETECTED_AGENTS_SWR_KEY: 'agents.detected',
  fetchDetectedAgents: vi.fn(),
}));

vi.mock('swr', () => ({
  default: vi.fn((_key: string) => ({
    data: [
      {
        id: 'claude-row',
        name: 'Claude Code',
        backend: 'claude',
        agent_type: 'acp',
        handshake: {
          available_models: {
            current_model_id: 'default',
            current_model_label: 'Default (recommended)',
            available_models: [
              { id: 'default', label: 'Default (recommended)' },
              { id: 'opus', label: 'MiniMax-M2.7-highspeed' },
            ],
          },
        },
      },
    ],
  })),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  const React = await vi.importActual<typeof import('react')>('react');

  const Menu = Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    Item: ({
      children,
      onClick,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      key?: string;
      className?: string;
    }) => (
      <button type='button' data-testid='menu-item' onClick={onClick}>
        {children}
      </button>
    ),
  });

  return {
    ...actual,
    Menu,
    Dropdown: ({ children, droplist }: { children?: React.ReactNode; droplist?: React.ReactNode }) => {
      const [open, setOpen] = React.useState(dropdownOpen);
      return (
        <div>
          <div
            data-testid='dropdown-trigger'
            onClick={() => {
              dropdownOpen = !open;
              setOpen(!open);
            }}
          >
            {children}
          </div>
          {open ? <div>{droplist}</div> : null}
        </div>
      );
    },
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';

describe('AcpModelSelector managed CLI mapping', () => {
  beforeEach(() => {
    dropdownOpen = false;
  });

  it('normalizes Claude dropdown to managed provider models only', async () => {
    render(
      <ConfigProvider>
        <AcpModelSelector conversation_id='conv-1' backend='claude' initialModelId='MiniMax-M2.7-highspeed' />
      </ConfigProvider>
    );

    expect((await screen.findAllByText('MiniMax-M2.7-highspeed')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('dropdown-trigger'));

    const items = screen.getAllByTestId('menu-item').map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['MiniMax-M2.7-highspeed', 'mimo-v2.5', 'deepseek-v4-pro']);
    expect(screen.queryByText('Default (recommended)')).not.toBeInTheDocument();
  });
});
