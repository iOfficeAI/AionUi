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
  Switch: ({ checked, onChange }: { checked?: boolean; onChange?: (v: boolean) => void }) => (
    <button role='switch' aria-checked={checked} onClick={() => onChange?.(!checked)}>
      switch
    </button>
  ),
}));

vi.mock('@icon-park/react', () => ({
  Setting: () => <span data-testid='icon-setting'>SettingIcon</span>,
  Robot: () => <span data-testid='icon-robot'>RobotIcon</span>,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn(() => null),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

  it('renders description and setup link', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    expect(screen.getByText('settings.agentManagement.localAgentsDescription')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.localAgentsSetupLink')).toBeTruthy();
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
});
