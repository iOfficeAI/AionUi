/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any imports
// ---------------------------------------------------------------------------

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

const mockNavigate = vi.hoisted(() => vi.fn());
const mockGetAvailableAgents = vi.hoisted(() => vi.fn());
const mockSwrMutate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    acpConversation: {
      getAvailableAgents: { invoke: mockGetAvailableAgents },
    },
  },
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, mutate: mockSwrMutate, isLoading: false })),
  mutate: mockSwrMutate,
}));

vi.mock('@arco-design/web-react', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
  Typography: {
    Text: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
      <span {...props}>{children}</span>
    ),
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Space: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Switch: ({ checked, onChange }: { checked?: boolean; onChange?: (v: boolean) => void }) => (
    <button role='switch' aria-checked={checked} onClick={() => onChange?.(!checked)}>
      switch
    </button>
  ),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    children,
    visible,
    contentStyle,
  }: {
    children: React.ReactNode;
    visible: boolean;
    contentStyle?: { background?: string };
  }) =>
    visible ? (
      <div data-testid='aion-modal' data-background={contentStyle?.background ?? ''}>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: { get: vi.fn().mockResolvedValue([]), set: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@icon-park/react', () => ({
  Home: () => <span data-testid='icon-home'>HomeIcon</span>,
  Setting: () => <span data-testid='icon-setting'>SettingIcon</span>,
  Robot: () => <span data-testid='icon-robot'>RobotIcon</span>,
  Plus: () => <span data-testid='icon-plus'>PlusIcon</span>,
  Close: () => <span data-testid='icon-close'>CloseIcon</span>,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn(() => null),
  resolveAgentLogo: vi.fn(() => null),
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: vi.fn(() => undefined),
}));

vi.mock('@/renderer/hooks/agent/useHubAgents', () => ({
  useHubAgents: () => ({ agents: [], loading: false, install: vi.fn(), retryInstall: vi.fn(), update: vi.fn() }),
}));

vi.mock('../../src/renderer/pages/settings/AgentSettings/AgentHubModal', () => ({
  AgentHubModal: ({ visible }: { visible: boolean }) => (visible ? <div data-testid='hub-modal' /> : null),
}));

vi.mock('@/renderer/utils/model/agentTypes', async (importOriginal) => ({
  ...(await importOriginal()),
  DETECTED_AGENTS_SWR_KEY: 'agents.detected',
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('../../src/renderer/pages/settings/AgentSettings/InlineAgentEditor', () => ({
  default: () => <div data-testid='inline-agent-editor' />,
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import LocalAgents from '../../src/renderer/pages/settings/AgentSettings/LocalAgents';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvailableAgents.mockResolvedValue({ success: true, data: [] });
    mockSwrMutate.mockResolvedValue(undefined);
  });

  it('renders description and detect custom agent link', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    expect(screen.getByText('settings.agentManagement.localAgentsDescription')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.detectCustomAgent')).toBeTruthy();
  });

  it('renders detected section heading', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    expect(screen.getByText('settings.agentManagement.detected')).toBeTruthy();
  });

  it('renders empty state when no agents detected', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    expect(screen.getByText('settings.agentManagement.localAgentsEmpty')).toBeTruthy();
  });

  it('hides "install from market" card in non-development environment', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await act(async () => {
        render(<LocalAgents />);
      });
      expect(screen.queryByText('settings.agentManagement.installFromMarket')).toBeNull();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('shows "install from market" card in development environment', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await act(async () => {
        render(<LocalAgents />);
      });
      expect(screen.getAllByText('settings.agentManagement.installFromMarket').length).toBeGreaterThan(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('uses the shared dialog surface for the custom agent editor modal', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    fireEvent.click(screen.getByText('settings.agentManagement.detectCustomAgent'));

    expect(screen.getByTestId('aion-modal')).toHaveAttribute('data-background', 'var(--dialog-fill-0)');
    expect(screen.getByTestId('inline-agent-editor')).toBeTruthy();
  });
});
