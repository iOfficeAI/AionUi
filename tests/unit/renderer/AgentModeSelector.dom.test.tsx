/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';

const { refreshConversationCacheMock, setModeInvokeMock, updateConversationInvokeMock, useAcpConfigOptionsMock } =
  vi.hoisted(() => ({
    refreshConversationCacheMock: vi.fn(),
    setModeInvokeMock: vi.fn(),
    updateConversationInvokeMock: vi.fn(),
    useAcpConfigOptionsMock: vi.fn(),
  }));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      setMode: {
        invoke: setModeInvokeMock,
      },
    },
    conversation: {
      update: {
        invoke: updateConversationInvokeMock,
      },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(),
  },
}));

vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
  useAcpConfigOptions: useAcpConfigOptionsMock,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/guid/hooks/agentSelectionUtils', () => ({
  savePreferredMode: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: refreshConversationCacheMock,
}));

vi.mock('@/renderer/components/agent/MarqueePillLabel', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span aria-hidden='true'>v</span>,
  Loading: ({ className }: { className?: string }) => <span aria-hidden='true' className={className} />,
}));

vi.mock('@arco-design/web-react', () => {
  let onClickMenuItem: undefined | ((key: string) => void);
  const Menu = Object.assign(
    ({
      children,
      onClickMenuItem: onClick,
    }: {
      children?: React.ReactNode;
      onClickMenuItem?: (key: string) => void;
    }) => {
      onClickMenuItem = onClick;
      return <div>{children}</div>;
    },
    {
      ItemGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Item: ({ children }: { children?: React.ReactNode }) => (
        <div
          role='menuitem'
          onClick={(event) => {
            const modeValue = event.currentTarget.querySelector('[data-mode-value]')?.getAttribute('data-mode-value');
            if (modeValue) onClickMenuItem?.(modeValue);
          }}
        >
          {children}
        </div>
      ),
    }
  );
  return {
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
    Dropdown: ({ children, droplist }: { children?: React.ReactNode; droplist?: React.ReactNode }) => (
      <>
        {children}
        {droplist}
      </>
    ),
    Menu,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      key === 'agentMode.permission'
        ? '权限'
        : key === 'agentMode.default'
          ? '默认'
          : key === 'agentMode.bypassPermissions'
            ? '全自动'
            : (options?.defaultValue ?? key),
  }),
}));

const runtimeMode = () => ({
  id: 'mode',
  category: 'mode',
  currentValue: 'default',
  options: [
    { value: 'default', label: 'Default' },
    { value: 'bypassPermissions', label: 'Bypass Permissions' },
  ],
});

describe('AgentModeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setModeInvokeMock.mockResolvedValue({ mode: 'bypassPermissions', initialized: true });
    updateConversationInvokeMock.mockResolvedValue(true);
    refreshConversationCacheMock.mockResolvedValue(undefined);
    useAcpConfigOptionsMock.mockImplementation(() => ({
      setStatus: { state: 'idle' },
      mode: runtimeMode(),
      model: null,
      thoughtLevel: null,
      reload: vi.fn(),
      setConfigOption: vi.fn(),
    }));
  });

  it('keeps observed runtime mode after rerender when initialMode is stale', async () => {
    const { rerender } = render(
      <AgentModeSelector
        backend='claude'
        conversation_id='conv-1'
        compact
        initialMode='bypassPermissions'
        modeLabelFormatter={(mode) => (mode.value === 'default' ? '默认' : '全自动')}
        compactLabelPrefix='权限'
      />
    );

    await waitFor(() => expect(screen.getByTestId('mode-selector')).toHaveAttribute('data-current-mode', 'default'));

    rerender(
      <AgentModeSelector
        backend='claude'
        conversation_id='conv-1'
        compact
        initialMode='bypassPermissions'
        modeLabelFormatter={(mode) => (mode.value === 'default' ? '默认' : '全自动')}
        compactLabelPrefix='权限'
      />
    );

    await waitFor(() => expect(screen.getByTestId('mode-selector')).toHaveAttribute('data-current-mode', 'default'));
    expect(screen.getByText('权限 · 默认')).toBeInTheDocument();
  });

  it('renders setting progress at the compact trailing edge instead of using Arco button loading', async () => {
    useAcpConfigOptionsMock.mockImplementation(() => ({
      setStatus: { state: 'setting' },
      mode: runtimeMode(),
      model: null,
      thoughtLevel: null,
      reload: vi.fn(),
      setConfigOption: vi.fn(),
    }));

    render(
      <AgentModeSelector
        backend='claude'
        conversation_id='conv-1'
        compact
        modeLabelFormatter={(mode) => (mode.value === 'default' ? '默认' : '全自动')}
        compactLabelPrefix='权限'
      />
    );

    const button = screen.getByTestId('agent-mode-selector-claude');
    const loading = screen.getByTestId('runtime-selector-loading-indicator');

    expect(button).not.toHaveAttribute('loading');
    expect(button).toHaveTextContent('权限 · 默认');
    expect(loading.parentElement?.lastElementChild).toBe(loading);
  });

  it('falls back to legacy mode endpoint and persists session mode for historical conversations', async () => {
    const setConfigOption = vi.fn();
    const beforeRuntimeSync = vi.fn().mockResolvedValue(undefined);
    useAcpConfigOptionsMock.mockImplementation(() => ({
      setStatus: { state: 'idle' },
      mode: null,
      model: null,
      thoughtLevel: null,
      reload: vi.fn(),
      setConfigOption,
    }));

    render(
      <AgentModeSelector
        backend='claude'
        conversation_id='conv-legacy'
        compact
        initialMode='default'
        dynamicModes={[
          { value: 'default', label: 'Default' },
          { value: 'bypassPermissions', label: 'Bypass Permissions' },
        ]}
        beforeRuntimeSync={beforeRuntimeSync}
        modeLabelFormatter={(mode) => (mode.value === 'default' ? '默认' : '全自动')}
        compactLabelPrefix='权限'
      />
    );

    fireEvent.click(screen.getByTestId('agent-mode-selector-claude'));
    fireEvent.click(screen.getByTestId('aionrs-mode-option-bypassPermissions'));

    await waitFor(() => {
      expect(setModeInvokeMock).toHaveBeenCalledWith({
        conversation_id: 'conv-legacy',
        mode: 'bypassPermissions',
      });
    });
    expect(beforeRuntimeSync).toHaveBeenCalledTimes(1);
    expect(setConfigOption).not.toHaveBeenCalled();
    expect(updateConversationInvokeMock).toHaveBeenCalledWith({
      id: 'conv-legacy',
      updates: { extra: { session_mode: 'bypassPermissions' } },
      merge_extra: true,
    });
    expect(refreshConversationCacheMock).toHaveBeenCalledWith('conv-legacy');
    expect(screen.getByTestId('mode-selector')).toHaveAttribute('data-current-mode', 'bypassPermissions');
  });
});
