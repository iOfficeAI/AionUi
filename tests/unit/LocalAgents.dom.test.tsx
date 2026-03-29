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
const mockConfigGet = vi.hoisted(() => vi.fn());
const mockConfigSet = vi.hoisted(() => vi.fn());
const mockRefreshCustomAgents = vi.hoisted(() => vi.fn());
const mockGetAvailableAgents = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockMessage = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: mockConfigGet,
    set: mockConfigSet,
    remove: vi.fn(),
  },
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    acpConversation: {
      getAvailableAgents: { invoke: mockGetAvailableAgents },
      refreshCustomAgents: { invoke: mockRefreshCustomAgents },
    },
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    refreshCustomAgents: { invoke: mockRefreshCustomAgents },
    testCustomAgent: { invoke: vi.fn() },
  },
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, mutate: mockMutate, isLoading: false })),
  mutate: mockMutate,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Link: ({ children, href }: { children: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
  Modal: ({
    visible,
    children,
    onOk,
    onCancel,
    title,
  }: {
    visible?: boolean;
    children?: React.ReactNode;
    onOk?: () => void;
    onCancel?: () => void;
    title?: React.ReactNode;
  }) =>
    visible ? (
      <div role='dialog'>
        <div>{title}</div>
        {children}
        <button onClick={onOk}>ok</button>
        <button onClick={onCancel}>cancel</button>
      </div>
    ) : null,
  Typography: {
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  },
  Message: {
    useMessage: () => [mockMessage, <div key='msg' />],
  },
  Switch: ({ checked, onChange }: { checked?: boolean; onChange?: (v: boolean) => void }) => (
    <button role='switch' aria-checked={checked} onClick={() => onChange?.(!checked)}>
      switch
    </button>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (v: string) => void;
    placeholder?: string;
  }) => (
    <input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} role='textbox' />
  ),
  Space: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Alert: ({ content }: { content?: React.ReactNode }) => <div>{content}</div>,
  Collapse: Object.assign(
    ({
      children,
      activeKey,
      onChange,
    }: {
      children: React.ReactNode;
      activeKey?: string[];
      onChange?: (_key: string, keys: string[]) => void;
    }) => (
      <div>
        <button onClick={() => onChange?.('advanced', activeKey?.includes('advanced') ? [] : ['advanced'])}>
          advanced toggle
        </button>
        {children}
      </div>
    ),
    {
      Item: ({ children, header }: { children?: React.ReactNode; header?: React.ReactNode; name?: string }) => (
        <div>
          <div>{header}</div>
          <div>{children}</div>
        </div>
      ),
    }
  ),
}));

vi.mock('@icon-park/react', () => ({
  Plus: () => <span>PlusIcon</span>,
  Setting: () => <span data-testid='icon-setting'>SettingIcon</span>,
  EditTwo: () => <span data-testid='icon-edit'>EditIcon</span>,
  Delete: () => <span data-testid='icon-delete'>DeleteIcon</span>,
  Robot: () => <span data-testid='icon-robot'>RobotIcon</span>,
  CheckOne: () => <span>CheckOneIcon</span>,
  CloseOne: () => <span>CloseOneIcon</span>,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn(() => null),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@/common/utils', () => ({ uuid: () => 'mock-uuid' }));

vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div />,
}));

vi.mock('@codemirror/lang-json', () => ({ json: () => [] }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import LocalAgents from '../../src/renderer/pages/settings/AgentSettings/LocalAgents';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockResolvedValue(null);
    mockConfigSet.mockResolvedValue(undefined);
    mockGetAvailableAgents.mockResolvedValue({ success: true, data: [] });
    mockRefreshCustomAgents.mockResolvedValue(undefined);
    mockMutate.mockResolvedValue(undefined);
  });

  it('renders description and add button', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    expect(screen.getByText('settings.agentManagement.localAgentsDescription')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.addCustomAgent')).toBeTruthy();
  });

  it('renders empty states when no agents', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    await waitFor(() => {
      expect(screen.getByText('settings.agentManagement.localAgentsEmpty')).toBeTruthy();
      expect(screen.getByText('settings.agentManagement.customEmpty')).toBeTruthy();
    });
  });

  it('renders custom agents from config storage', async () => {
    mockConfigGet.mockResolvedValue([
      { id: 'c1', name: 'My Custom Agent', defaultCliPath: '/usr/bin/custom', enabled: true },
    ]);

    await act(async () => {
      render(<LocalAgents />);
    });

    await waitFor(() => {
      expect(screen.getByText('My Custom Agent')).toBeTruthy();
    });
  });

  it('shows inline editor when add button clicked', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    const addButton = screen.getByText('settings.agentManagement.addCustomAgent');

    await act(async () => {
      fireEvent.click(addButton);
    });

    expect(screen.getByText('settings.agentDisplayName')).toBeTruthy();
  });

  it('saves custom agent and shows success message', async () => {
    mockConfigGet.mockResolvedValue([]);

    await act(async () => {
      render(<LocalAgents />);
    });

    // Click Add button
    const addButton = screen.getByText('settings.agentManagement.addCustomAgent');
    await act(async () => {
      fireEvent.click(addButton);
    });

    // Fill in name and command inputs
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: 'New Agent' } });
    });
    await act(async () => {
      fireEvent.change(inputs[1], { target: { value: '/usr/bin/new-agent' } });
    });

    // Click save button
    const buttons = screen.getAllByRole('button');
    const saveButton = buttons.find((btn) => btn.textContent?.includes('common.save'));
    expect(saveButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(saveButton!);
    });

    await waitFor(() => {
      expect(mockConfigSet).toHaveBeenCalledWith('acp.customAgents', expect.any(Array));
      expect(mockMessage.success).toHaveBeenCalled();
    });
  });

  it('filters out preset agents', async () => {
    mockConfigGet.mockResolvedValue([
      { id: 'p1', name: 'Preset', defaultCliPath: '/bin/p', isPreset: true, enabled: true },
      { id: 'c1', name: 'Custom', defaultCliPath: '/bin/c', enabled: true },
    ]);

    await act(async () => {
      render(<LocalAgents />);
    });

    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeTruthy();
      expect(screen.queryByText('Preset')).toBeNull();
    });
  });
});
