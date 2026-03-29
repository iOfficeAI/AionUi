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

const mockTestCustomAgent = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    testCustomAgent: { invoke: (...args: unknown[]) => mockTestCustomAgent(...args) },
  },
}));

vi.mock('@/common/utils', () => ({ uuid: () => 'mock-uuid' }));

vi.mock('@icon-park/react', () => ({
  Plus: () => <span>PlusIcon</span>,
  Delete: () => <span>DeleteIcon</span>,
  CheckOne: () => <span>CheckOneIcon</span>,
  CloseOne: () => <span>CloseOneIcon</span>,
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div data-testid='codemirror' />,
}));

vi.mock('@codemirror/lang-json', () => ({ json: () => [] }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import InlineAgentEditor from '../../src/renderer/pages/settings/AgentSettings/InlineAgentEditor';
import type { AcpBackendConfig } from '../../src/common/types/acpTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeAgent = (overrides: Partial<AcpBackendConfig> = {}): AcpBackendConfig => ({
  id: 'agent-1',
  name: 'My Agent',
  defaultCliPath: '/usr/bin/my-agent',
  acpArgs: ['--acp', '--verbose'],
  env: { API_KEY: 'secret' },
  enabled: true,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InlineAgentEditor', () => {
  beforeEach(() => {
    mockTestCustomAgent.mockReset();
  });

  it('renders empty form for new agent', async () => {
    await act(async () => {
      render(<InlineAgentEditor onSave={vi.fn()} onCancel={vi.fn()} />);
    });

    expect(screen.getByText('settings.agentDisplayName')).toBeTruthy();
    expect(screen.getByText('settings.commandLabel')).toBeTruthy();
    expect(screen.getByText('settings.argsLabel')).toBeTruthy();
  });

  it('populates form fields when editing existing agent', async () => {
    const agent = makeAgent();

    await act(async () => {
      render(<InlineAgentEditor agent={agent} onSave={vi.fn()} onCancel={vi.fn()} />);
    });

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    // name input
    expect(inputs[0].value).toBe('My Agent');
    // command input
    expect(inputs[1].value).toBe('/usr/bin/my-agent');
    // args input
    expect(inputs[2].value).toBe('--acp --verbose');
    // env key and value inputs
    expect(screen.getByDisplayValue('API_KEY')).toBeTruthy();
    expect(screen.getByDisplayValue('secret')).toBeTruthy();
  });

  it('save button is disabled when name and command are empty', async () => {
    await act(async () => {
      render(<InlineAgentEditor onSave={vi.fn()} onCancel={vi.fn()} />);
    });

    const buttons = screen.getAllByRole('button');
    const saveButton = buttons.find((btn) => btn.textContent?.includes('common.save'));
    expect(saveButton).toBeTruthy();
    expect(saveButton?.hasAttribute('disabled')).toBe(true);
  });

  it('calls onCancel when cancel is clicked', async () => {
    const onCancel = vi.fn();

    await act(async () => {
      render(<InlineAgentEditor onSave={vi.fn()} onCancel={onCancel} />);
    });

    const buttons = screen.getAllByRole('button');
    const cancelButton = buttons.find((btn) => btn.textContent?.includes('common.cancel'));
    expect(cancelButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(cancelButton!);
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onSave with agent config on submit', async () => {
    const onSave = vi.fn();

    await act(async () => {
      render(<InlineAgentEditor onSave={onSave} onCancel={vi.fn()} />);
    });

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: 'Test Agent' } });
    });
    await act(async () => {
      fireEvent.change(inputs[1], { target: { value: '/usr/bin/test' } });
    });

    const buttons = screen.getAllByRole('button');
    const saveButton = buttons.find((btn) => btn.textContent?.includes('common.save'));
    expect(saveButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(saveButton!);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as AcpBackendConfig;
    expect(saved.name).toBe('Test Agent');
    expect(saved.defaultCliPath).toBe('/usr/bin/test');
    expect(saved.id).toBe('mock-uuid');
    expect(saved.enabled).toBe(true);
  });

  it('shows success alert after successful test connection', async () => {
    mockTestCustomAgent.mockResolvedValue({ success: true });
    const agent = makeAgent();

    await act(async () => {
      render(<InlineAgentEditor agent={agent} onSave={vi.fn()} onCancel={vi.fn()} />);
    });

    const buttons = screen.getAllByRole('button');
    const testButton = buttons.find((btn) => btn.textContent?.includes('settings.testConnectionBtn'));
    expect(testButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(testButton!);
    });

    expect(screen.getByText('settings.testConnectionSuccess')).toBeTruthy();
  });

  it('shows CLI failure alert when step is cli_check', async () => {
    mockTestCustomAgent.mockResolvedValue({ success: false, data: { step: 'cli_check' } });
    const agent = makeAgent();

    await act(async () => {
      render(<InlineAgentEditor agent={agent} onSave={vi.fn()} onCancel={vi.fn()} />);
    });

    const buttons = screen.getAllByRole('button');
    const testButton = buttons.find((btn) => btn.textContent?.includes('settings.testConnectionBtn'));

    await act(async () => {
      fireEvent.click(testButton!);
    });

    expect(screen.getByText('settings.testConnectionFailCli')).toBeTruthy();
  });

  it('shows ACP failure alert when step is acp_initialize', async () => {
    mockTestCustomAgent.mockResolvedValue({ success: false, data: { step: 'acp_initialize' } });
    const agent = makeAgent();

    await act(async () => {
      render(<InlineAgentEditor agent={agent} onSave={vi.fn()} onCancel={vi.fn()} />);
    });

    const buttons = screen.getAllByRole('button');
    const testButton = buttons.find((btn) => btn.textContent?.includes('settings.testConnectionBtn'));

    await act(async () => {
      fireEvent.click(testButton!);
    });

    expect(screen.getByText('settings.testConnectionFailAcp')).toBeTruthy();
  });

  it('shows CLI failure alert when test connection throws', async () => {
    mockTestCustomAgent.mockRejectedValue(new Error('Connection refused'));
    const agent = makeAgent();

    await act(async () => {
      render(<InlineAgentEditor agent={agent} onSave={vi.fn()} onCancel={vi.fn()} />);
    });

    const buttons = screen.getAllByRole('button');
    const testButton = buttons.find((btn) => btn.textContent?.includes('settings.testConnectionBtn'));

    await act(async () => {
      fireEvent.click(testButton!);
    });

    expect(screen.getByText('settings.testConnectionFailCli')).toBeTruthy();
  });

  it('preserves agent id and enabled state when editing', async () => {
    const onSave = vi.fn();
    const agent = makeAgent({ id: 'existing-id', enabled: false });

    await act(async () => {
      render(<InlineAgentEditor agent={agent} onSave={onSave} onCancel={vi.fn()} />);
    });

    const buttons = screen.getAllByRole('button');
    const saveButton = buttons.find((btn) => btn.textContent?.includes('common.save'));

    await act(async () => {
      fireEvent.click(saveButton!);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as AcpBackendConfig;
    expect(saved.id).toBe('existing-id');
    expect(saved.enabled).toBe(false);
  });
});
