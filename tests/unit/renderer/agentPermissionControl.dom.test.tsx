/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * DOM tests for AgentPermissionControl: renders nothing for unsupported /
 * uninstalled agents; otherwise renders a level selector that write-throughs
 * via ipcBridge.permissionPolicy and reflects the echoed read-model.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permissionPolicy: {
    list: { invoke: vi.fn(async () => []) },
    setLevel: { invoke: vi.fn(async () => ({}) as never) },
    clear: { invoke: vi.fn(async () => ({}) as never) },
  },
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@/common', () => ({ ipcBridge: { ...mocks, permissionPolicy: mocks.permissionPolicy } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { success: mocks.messageSuccess, error: mocks.messageError },
    Select: ({
      value,
      onChange,
      options,
    }: {
      value?: string;
      onChange?: (v: string) => void;
      options?: { value: string; label: string }[];
    }) => (
      <select
        data-testid='agent-permission-select'
        value={value as string}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {(options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ),
  };
});

import AgentPermissionControl from '@/renderer/pages/settings/AgentSettings/AgentPermissionControl';

const actionablePolicy = {
  agent: 'opencode',
  supported: true,
  installed: true,
  current_level: null,
  config_path: '/home/user/.config/opencode/opencode.json',
};

describe('AgentPermissionControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the agent is not installed', () => {
    const { container } = render(
      <AgentPermissionControl policy={{ ...actionablePolicy, installed: false }} onChanged={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unsupported agent', () => {
    const { container } = render(
      <AgentPermissionControl policy={{ ...actionablePolicy, supported: false }} onChanged={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the policy is undefined', () => {
    const { container } = render(<AgentPermissionControl policy={undefined} onChanged={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a selector reflecting the current level', () => {
    render(<AgentPermissionControl policy={{ ...actionablePolicy, current_level: 'full_auto' }} onChanged={vi.fn()} />);
    const select = screen.getByTestId('agent-permission-select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('full_auto');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['__unmanaged__', 'ask', 'auto_edit', 'full_auto']);
  });

  it('writes through a level on change and calls onChanged + success toast', async () => {
    const onChanged = vi.fn();
    render(<AgentPermissionControl policy={actionablePolicy} onChanged={onChanged} />);
    const select = screen.getByTestId('agent-permission-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'auto_edit' } });
    expect(mocks.permissionPolicy.setLevel.invoke).toHaveBeenCalledWith({ agent: 'opencode', level: 'auto_edit' });
    await vi.waitFor(() => expect(mocks.messageSuccess).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });

  it('clears the policy for the unmanaged option', async () => {
    const onChanged = vi.fn();
    render(<AgentPermissionControl policy={{ ...actionablePolicy, current_level: 'ask' }} onChanged={onChanged} />);
    const select = screen.getByTestId('agent-permission-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '__unmanaged__' } });
    expect(mocks.permissionPolicy.clear.invoke).toHaveBeenCalledWith({ agent: 'opencode' });
    await vi.waitFor(() => expect(mocks.messageSuccess).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows an error toast when the write-through fails', async () => {
    mocks.permissionPolicy.setLevel.invoke.mockRejectedValueOnce(new Error('no config'));
    render(<AgentPermissionControl policy={actionablePolicy} onChanged={vi.fn()} />);
    const select = screen.getByTestId('agent-permission-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'full_auto' } });
    await vi.waitFor(() => expect(mocks.messageError).toHaveBeenCalled());
  });
});
