/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/assistant/useAssistantList.ts (A1 in N4a).
 * Tests useAssistantList hook: load, sort, and active selection behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const assistantOrderConfigMock = vi.hoisted(() => {
  const state: { value: string[] | undefined; listeners: Set<() => void> } = {
    value: undefined,
    listeners: new Set(),
  };
  const notify = () => {
    for (const listener of state.listeners) listener();
  };
  const service = {
    get: vi.fn(() => state.value),
    set: vi.fn(async (_key: string, value: string[] | undefined) => {
      state.value = value;
      notify();
    }),
    setLocal: vi.fn((_key: string, value: string[] | undefined) => {
      state.value = value;
      notify();
    }),
    subscribe: vi.fn((_key: string, listener: () => void) => {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    }),
  };

  return { state, service, notify };
});

// Mock @/common
vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: vi.fn(), provider: vi.fn() },
      setState: { invoke: vi.fn(), provider: vi.fn() },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: assistantOrderConfigMock.service,
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

import { useAssistantList } from '@/renderer/hooks/assistant/useAssistantList';
import { normalizeAssistantOrder } from '@/renderer/hooks/assistant/useAssistantOrder';
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';

describe('useAssistantList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantOrderConfigMock.state.value = undefined;
    assistantOrderConfigMock.service.set.mockImplementation(async (_key, value) => {
      assistantOrderConfigMock.state.value = value;
      assistantOrderConfigMock.notify();
    });
    assistantOrderConfigMock.service.setLocal.mockImplementation((_key, value) => {
      assistantOrderConfigMock.state.value = value;
      assistantOrderConfigMock.notify();
    });
  });

  it('normalizes duplicate and malformed stored order entries', () => {
    expect(normalizeAssistantOrder([' official ', '', 'cli', 'official'])).toEqual(['official', 'cli']);
  });

  it('loads assistants on mount and selects first by default', async () => {
    const mockList: Assistant[] = [
      { id: '1', name: 'Claude', sort_order: 1, source: 'builtin', enabled: true },
      { id: '2', name: 'GPT', sort_order: 2, source: 'user', enabled: true },
    ];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(mockList);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => expect(result.current.assistants).toHaveLength(2));

    expect(result.current.assistants[0].id).toBe('1');
    expect(result.current.activeAssistantId).toBe('1');
    expect(result.current.activeAssistant?.id).toBe('1');
  });

  it('preserves backend order instead of resorting client side', async () => {
    const mockList: Assistant[] = [
      { id: 'cowork', name: 'Cowork', sort_order: 2000, source: 'builtin', enabled: true },
      { id: 'writer', name: 'Writer', sort_order: 1000, source: 'user', enabled: true },
    ];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(mockList);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => expect(result.current.assistants).toHaveLength(2));

    expect(result.current.assistants.map((assistant) => assistant.id)).toEqual(['cowork', 'writer']);
  });

  it('handles empty list', async () => {
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue([]);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => expect(ipcBridge.assistants.list.invoke).toHaveBeenCalled());

    expect(result.current.assistants).toHaveLength(0);
    expect(result.current.activeAssistantId).toBeNull();
    expect(result.current.activeAssistant).toBeNull();
  });

  it('preserves active selection if still present after reload', async () => {
    const mockList: Assistant[] = [
      { id: '1', name: 'A', sort_order: 1, source: 'user', enabled: true },
      { id: '2', name: 'B', sort_order: 2, source: 'user', enabled: true },
    ];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(mockList);

    const { result } = renderHook(() => useAssistantList());
    await waitFor(() => expect(result.current.assistants).toHaveLength(2));

    // User selects '2'
    act(() => {
      result.current.setActiveAssistantId('2');
    });
    expect(result.current.activeAssistantId).toBe('2');

    // Reload (same list)
    await act(async () => {
      await result.current.loadAssistants();
    });

    // Should preserve '2'
    expect(result.current.activeAssistantId).toBe('2');
  });

  it('falls back to first assistant if previous active is removed', async () => {
    const initialList: Assistant[] = [
      { id: '1', name: 'A', sort_order: 1, source: 'user', enabled: true },
      { id: '2', name: 'B', sort_order: 2, source: 'user', enabled: true },
    ];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(initialList);

    const { result } = renderHook(() => useAssistantList());
    await waitFor(() => expect(result.current.assistants).toHaveLength(2));

    act(() => {
      result.current.setActiveAssistantId('2');
    });

    // Now '2' is removed from backend
    const updatedList: Assistant[] = [{ id: '1', name: 'A', sort_order: 1, source: 'user', enabled: true }];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(updatedList);

    await act(async () => {
      await result.current.loadAssistants();
    });

    // Should fallback to '1'
    expect(result.current.activeAssistantId).toBe('1');
  });

  it('logs error and does not crash on load failure', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (ipcBridge.assistants.list.invoke as any).mockRejectedValue(new Error('Backend down'));

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());

    expect(result.current.assistants).toHaveLength(0);
    expect(result.current.activeAssistantId).toBeNull();

    consoleErrorSpy.mockRestore();
  });

  it('reorders only enabled assistants through the shared preference', async () => {
    assistantOrderConfigMock.state.value = ['cli', 'custom', 'official'];
    const initialList: Assistant[] = [
      { id: 'official', name: 'Official', sort_order: 1, source: 'builtin', enabled: true },
      { id: 'disabled', name: 'Disabled', sort_order: 2, source: 'builtin', enabled: false },
      { id: 'custom', name: 'Custom', sort_order: 3, source: 'user', enabled: true },
      { id: 'cli', name: 'CLI', sort_order: 4, source: 'generated', enabled: true },
    ];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(initialList);

    const { result } = renderHook(() => useAssistantList());
    await waitFor(() => expect(result.current.assistants).toHaveLength(4));

    await act(async () => {
      await result.current.reorderEnabledAssistants('official', 'cli');
    });

    expect(result.current.assistantOrder).toEqual(['official', 'cli', 'custom']);
    expect(assistantOrderConfigMock.service.set).toHaveBeenCalledWith('assistants.enabledOrder', [
      'official',
      'cli',
      'custom',
    ]);
    expect(ipcBridge.assistants.setState.invoke).not.toHaveBeenCalled();
  });

  it('restores the enabled order when preference persistence fails', async () => {
    assistantOrderConfigMock.state.value = ['cli', 'official'];
    const initialList: Assistant[] = [
      { id: 'official', name: 'Official', sort_order: 1, source: 'builtin', enabled: true },
      { id: 'cli', name: 'CLI', sort_order: 2, source: 'generated', enabled: true },
    ];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(initialList);
    assistantOrderConfigMock.service.set.mockImplementationOnce(async (_key, value) => {
      assistantOrderConfigMock.state.value = value;
      assistantOrderConfigMock.notify();
      throw new Error('preference write failed');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAssistantList());
    await waitFor(() => expect(result.current.assistants).toHaveLength(2));

    await act(async () => {
      await expect(result.current.reorderEnabledAssistants('official', 'cli')).rejects.toThrow(
        'preference write failed'
      );
    });

    expect(result.current.assistantOrder).toEqual(['cli', 'official']);
    expect(assistantOrderConfigMock.service.setLocal).toHaveBeenCalledWith('assistants.enabledOrder', [
      'cli',
      'official',
    ]);
    consoleErrorSpy.mockRestore();
  });
});
