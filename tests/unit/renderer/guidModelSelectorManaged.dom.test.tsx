/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import type { IProvider } from '@/common/config/storage';

const managedProvider: IProvider = {
  id: 'desktop-newapi-managed-provider',
  name: 'POUNDING API',
  platform: 'new-api',
  base_url: 'https://api.mxou.cn',
  api_key: '',
  model: ['claude-sonnet-4-20250514', 'mimo-v2.5', 'deepseek-v4-pro'],
  models: ['claude-sonnet-4-20250514', 'mimo-v2.5', 'deepseek-v4-pro'],
  enabled: true,
  model_enabled: {
    'claude-sonnet-4-20250514': true,
    'mimo-v2.5': true,
    'deepseek-v4-pro': true,
  },
  model_health: {},
} as IProvider;

let dropdownOpen = false;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/hooks/context/NewApiAccountContext', () => ({
  useNewApiAccount: () => ({
    ready: true,
    status: { loggedIn: true, baseUrl: 'https://api.mxou.cn', models: managedProvider.models, updatedAt: Date.now() },
    isLoggedIn: true,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({
    data: [managedProvider],
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  const React = await vi.importActual<typeof import('react')>('react');

  const Menu = Object.assign(
    ({ children }: { children?: React.ReactNode }) => <div data-testid='menu-root'>{children}</div>,
    {
      Item: ({
        children,
        onClick,
      }: {
        children?: React.ReactNode;
        onClick?: () => void;
        key?: string;
        className?: string;
        disabled?: boolean;
      }) => (
        <button type='button' data-testid='menu-item' onClick={onClick}>
          {children}
        </button>
      ),
      ItemGroup: ({ children, title }: { children?: React.ReactNode; title?: React.ReactNode }) => (
        <div>
          <div data-testid='menu-group-title'>{title}</div>
          {children}
        </div>
      ),
    }
  );

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
          {open ? <div data-testid='dropdown-content'>{droplist}</div> : null}
        </div>
      );
    },
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';

describe('GuidModelSelector managed CLI mapping', () => {
  beforeEach(() => {
    dropdownOpen = false;
  });

  it('shows only managed provider models for Claude', () => {
    const setCurrentModel = vi.fn().mockResolvedValue(undefined);
    const setSelectedAcpModel = vi.fn();

    render(
      <ConfigProvider>
        <GuidModelSelector
          isGeminiMode={false}
          modelList={[managedProvider]}
          current_model={{ ...managedProvider, use_model: 'claude-sonnet-4-20250514' }}
          setCurrentModel={setCurrentModel}
          currentAcpCachedModelInfo={{
            current_model_id: 'claude-sonnet-4-20250514',
            current_model_label: 'claude-sonnet-4-20250514',
            available_models: [{ id: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4-20250514' }],
          }}
          selectedAcpModel='claude-sonnet-4-20250514'
          setSelectedAcpModel={setSelectedAcpModel}
          selectedAgentBackend='claude'
        />
      </ConfigProvider>
    );

    expect(screen.getAllByText('claude-sonnet-4-20250514').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('dropdown-trigger'));

    const items = screen.getAllByTestId('menu-item').map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['claude-sonnet-4-20250514']);
    expect(screen.queryByText('Default (recommended)')).not.toBeInTheDocument();
    expect(screen.queryByText('opus')).not.toBeInTheDocument();
  });

  it('shows only managed provider models for OpenCode', () => {
    const setCurrentModel = vi.fn().mockResolvedValue(undefined);
    const setSelectedAcpModel = vi.fn();

    render(
      <ConfigProvider>
        <GuidModelSelector
          isGeminiMode={false}
          modelList={[managedProvider]}
          current_model={{ ...managedProvider, use_model: 'mimo-v2.5' }}
          setCurrentModel={setCurrentModel}
          currentAcpCachedModelInfo={{
            current_model_id: 'aionui-new-api-desktop-newapi-managed-provider/mimo-v2.5',
            current_model_label: 'POUNDING API/mimo-v2.5',
            available_models: [{ id: 'claude/claude-sonnet-4-20250514', label: 'Claude/claude-sonnet-4-20250514' }],
          }}
          selectedAcpModel='mimo-v2.5'
          setSelectedAcpModel={setSelectedAcpModel}
          selectedAgentBackend='opencode'
        />
      </ConfigProvider>
    );

    fireEvent.click(screen.getByTestId('dropdown-trigger'));

    const items = screen.getAllByTestId('menu-item').map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['claude-sonnet-4-20250514', 'mimo-v2.5', 'deepseek-v4-pro']);
    expect(screen.queryByText('Default (recommended)')).not.toBeInTheDocument();
  });
});
