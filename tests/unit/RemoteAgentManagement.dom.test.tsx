/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
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

const mockIpc = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: 'new-id' }),
  update: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
  testConnection: vi.fn().mockResolvedValue({ success: true }),
  handshake: vi.fn().mockResolvedValue({ status: 'ok' as const }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'dark' }),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    remoteAgent: {
      list: { invoke: (...args: unknown[]) => mockIpc.list(...args) },
      create: { invoke: (...args: unknown[]) => mockIpc.create(...args) },
      update: { invoke: (...args: unknown[]) => mockIpc.update(...args) },
      delete: { invoke: (...args: unknown[]) => mockIpc.delete(...args) },
      testConnection: { invoke: (...args: unknown[]) => mockIpc.testConnection(...args) },
      handshake: { invoke: (...args: unknown[]) => mockIpc.handshake(...args) },
    },
  },
}));

const mockMutate = vi.fn().mockResolvedValue(undefined);
vi.mock('swr', () => ({
  default: vi.fn((_key: string, fetcher: () => unknown) => {
    let data: unknown;
    try {
      const result = fetcher?.();
      if (result && typeof result === 'object' && 'then' in result) {
        // Don't await, just return undefined for initial render
        data = undefined;
      } else {
        data = result;
      }
    } catch {
      data = undefined;
    }
    return { data, mutate: mockMutate, isLoading: false };
  }),
}));

vi.mock('../../src/renderer/components/chat/EmojiPicker', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='emoji-picker'>{children}</div>,
}));

vi.mock('@icon-park/react', () => ({
  Close: () => <span>CloseIcon</span>,
  Edit: () => <span>EditIcon</span>,
  Plus: () => <span>PlusIcon</span>,
  ReduceOne: () => <span>ReduceOneIcon</span>,
  Robot: () => <span>RobotIcon</span>,
  Speed: () => <span>SpeedIcon</span>,
}));

vi.mock('../../src/process/agent/remote/types', () => ({}));

import RemoteAgentManagement from '../../src/renderer/pages/settings/AgentSettings/RemoteAgentManagement';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RemoteAgentManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIpc.list.mockResolvedValue([]);
  });

  it('renders the description text', async () => {
    await act(async () => {
      render(<RemoteAgentManagement />);
    });

    expect(screen.getByText('settings.agentManagement.remoteAgentsDescription')).toBeTruthy();
  });

  it('renders empty state when no agents', async () => {
    await act(async () => {
      render(<RemoteAgentManagement />);
    });

    expect(screen.getByText('settings.remoteAgent.emptyTitle')).toBeTruthy();
  });

  it('renders add button', async () => {
    await act(async () => {
      render(<RemoteAgentManagement />);
    });

    expect(screen.getByText('settings.remoteAgent.add')).toBeTruthy();
  });

  it('renders agent list when agents are available', async () => {
    const useSWR = (await import('swr')).default as ReturnType<typeof vi.fn>;
    useSWR.mockReturnValue({
      data: [
        {
          id: 'a1',
          name: 'TestAgent',
          protocol: 'openclaw',
          url: 'wss://test.com',
          authType: 'bearer',
          status: 'connected',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      mutate: mockMutate,
      isLoading: false,
    });

    await act(async () => {
      render(<RemoteAgentManagement />);
    });

    expect(screen.getByText('TestAgent')).toBeTruthy();
    expect(screen.getByText('openclaw')).toBeTruthy();
    expect(screen.getByText('connected')).toBeTruthy();
  });
});
