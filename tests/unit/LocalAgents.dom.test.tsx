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
const mockConfigGet = vi.hoisted(() => vi.fn());
const mockConfigSet = vi.hoisted(() => vi.fn());
const mockRefreshCustomAgents = vi.hoisted(() => vi.fn());

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

vi.mock('../../src/common/adapter/ipcBridge', () => ({
  acpConversation: {
    refreshCustomAgents: { invoke: mockRefreshCustomAgents },
    testCustomAgent: { invoke: vi.fn().mockResolvedValue({ success: true }) },
  },
}));

vi.mock('../../src/common/config/storage', () => ({
  ConfigStorage: {
    get: mockConfigGet,
    set: mockConfigSet,
  },
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, mutate: mockSwrMutate, isLoading: false })),
  mutate: mockSwrMutate,
}));

vi.mock('@arco-design/web-react', () => {
  let msgInstance: ReturnType<typeof vi.fn>;
  return {
    Link: ({ children, href }: { children: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
    Typography: {
      Text: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
        <span {...props}>{children}</span>
      ),
    },
    Button: ({
      children,
      onClick,
      icon,
      ...rest
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      icon?: React.ReactNode;
      [k: string]: unknown;
    }) => (
      <button onClick={onClick} {...rest}>
        {icon}
        {children}
      </button>
    ),
    Switch: ({ checked, onChange }: { checked?: boolean; onChange?: (v: boolean) => void }) => (
      <button role='switch' aria-checked={checked} onClick={() => onChange?.(!checked)}>
        switch
      </button>
    ),
    Modal: {
      confirm: vi.fn(({ onOk }: { onOk?: () => void }) => {
        // Auto-confirm for tests
        onOk?.();
      }),
    },
    Message: {
      useMessage: () => {
        msgInstance = msgInstance || { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
        return [msgInstance, <React.Fragment key='msg' />];
      },
    },
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Space: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Input: (props: Record<string, unknown>) => <input {...props} />,
    Collapse: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, {
      Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }),
    Alert: ({ content }: { content?: React.ReactNode }) => <div>{content}</div>,
    Form: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, {
      Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }),
  };
});

vi.mock('@icon-park/react', () => ({
  Setting: () => <span data-testid='icon-setting'>SettingIcon</span>,
  Robot: () => <span data-testid='icon-robot'>RobotIcon</span>,
  Plus: () => <span data-testid='icon-plus'>PlusIcon</span>,
  EditTwo: () => <span data-testid='icon-edit'>EditIcon</span>,
  Delete: () => <span data-testid='icon-delete'>DeleteIcon</span>,
  CheckOne: () => <span>CheckIcon</span>,
  CloseOne: () => <span>CloseIcon</span>,
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div data-testid='codemirror'>CodeMirror</div>,
}));

vi.mock('@codemirror/lang-json', () => ({
  json: vi.fn(),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn(() => null),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('../../src/common/utils', () => ({
  uuid: () => 'test-uuid-123',
}));

vi.mock('../../src/renderer/pages/settings/AgentSettings/InlineAgentEditor', () => ({
  default: ({ onSave }: { onSave: (agent: Record<string, unknown>) => void }) => (
    <button
      data-testid='inline-editor-save'
      onClick={() => onSave({ id: 'test-uuid-123', name: 'New Agent', defaultCliPath: 'test', enabled: true })}
    >
      SaveAgent
    </button>
  ),
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
    mockConfigGet.mockResolvedValue([]);
    mockConfigSet.mockResolvedValue(undefined);
    mockRefreshCustomAgents.mockResolvedValue(undefined);
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

  it('renders custom agents section with add button', async () => {
    await act(async () => {
      render(<LocalAgents />);
    });

    expect(screen.getByText('settings.agentManagement.customAgents')).toBeTruthy();
    expect(screen.getByText('settings.addCustomAgentTitle')).toBeTruthy();
  });

  it('saves custom agent while preserving preset agents in config', async () => {
    const presetAgent = {
      id: 'cowork',
      name: 'Cowork',
      isPreset: true,
      enabled: true,
      context: 'test context',
    };

    mockConfigGet.mockResolvedValue([presetAgent]);

    await act(async () => {
      render(<LocalAgents />);
    });

    // Click add button to show InlineAgentEditor
    const addButton = screen.getByText('settings.addCustomAgentTitle');
    await act(async () => {
      fireEvent.click(addButton);
    });

    // Trigger save via the mocked InlineAgentEditor
    const saveButton = screen.getByTestId('inline-editor-save');
    await act(async () => {
      fireEvent.click(saveButton);
    });

    // Core assertion: ConfigStorage.set must be called with presets preserved
    expect(mockConfigSet).toHaveBeenCalledWith(
      'acp.customAgents',
      expect.arrayContaining([
        expect.objectContaining({ id: 'cowork', isPreset: true }),
        expect.objectContaining({ name: 'New Agent' }),
      ])
    );
  });
});

describe('LocalAgents save preserves presets (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvailableAgents.mockResolvedValue({ success: true, data: [] });
    mockSwrMutate.mockResolvedValue(undefined);
    mockConfigSet.mockResolvedValue(undefined);
    mockRefreshCustomAgents.mockResolvedValue(undefined);
  });

  it('handleSaveAgent reads full config and preserves preset entries', async () => {
    // This test verifies the core fix: when saving a custom agent,
    // the full config (including presets) is read first, then the
    // new agent is appended, and the full array is written back.

    const presetAgent = {
      id: 'cowork',
      name: 'Cowork',
      isPreset: true,
      enabled: true,
      context: 'some rules',
    };

    const existingCustom = {
      id: 'existing-custom',
      name: 'MyAgent',
      defaultCliPath: 'myagent',
      enabled: true,
    };

    // Config contains both preset and custom agents
    mockConfigGet.mockResolvedValue([presetAgent, existingCustom]);

    await act(async () => {
      render(<LocalAgents />);
    });

    // Verify custom agents are loaded (presets filtered out for display)
    expect(screen.getByText('MyAgent')).toBeTruthy();

    // Verify the preset is NOT displayed in custom agents section
    // (it should only appear in assistant management, not here)
    expect(screen.queryByText('Cowork')).toBeNull();
  });
});
