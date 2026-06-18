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

// Mock @/common
vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: vi.fn(), provider: vi.fn() },
      setState: { invoke: vi.fn(), provider: vi.fn() },
    },
  },
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

import { useAssistantList } from '@/renderer/hooks/assistant/useAssistantList';
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';

describe('useAssistantList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('reorders assistants and persists sort_order updates', async () => {
    const initialList: Assistant[] = [
      { id: '1', name: 'A', sort_order: 1, source: 'user', enabled: true },
      { id: '2', name: 'B', sort_order: 2, source: 'user', enabled: true },
      { id: '3', name: 'C', sort_order: 3, source: 'user', enabled: true },
    ];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(initialList);
    (ipcBridge.assistants.setState.invoke as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAssistantList());
    await waitFor(() => expect(result.current.assistants).toHaveLength(3));

    await act(async () => {
      await result.current.reorderAssistants('3', '1');
    });

    expect(result.current.assistants.map((assistant) => assistant.id)).toEqual(['3', '1', '2']);
    expect(ipcBridge.assistants.setState.invoke).toHaveBeenCalledTimes(3);
    expect(ipcBridge.assistants.setState.invoke).toHaveBeenNthCalledWith(1, { id: '3', sort_order: 1000 });
    expect(ipcBridge.assistants.setState.invoke).toHaveBeenNthCalledWith(2, { id: '1', sort_order: 2000 });
    expect(ipcBridge.assistants.setState.invoke).toHaveBeenNthCalledWith(3, { id: '2', sort_order: 3000 });
  });

  it('restores the previous order when reorder persistence fails', async () => {
    const initialList: Assistant[] = [
      { id: '1', name: 'A', sort_order: 1, source: 'user', enabled: true },
      { id: '2', name: 'B', sort_order: 2, source: 'user', enabled: true },
    ];
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue(initialList);
    (ipcBridge.assistants.setState.invoke as any).mockRejectedValue(new Error('persist failed'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAssistantList());
    await waitFor(() => expect(result.current.assistants).toHaveLength(2));

    await act(async () => {
      await result.current.reorderAssistants('2', '1');
    });

    expect(result.current.assistants.map((assistant) => assistant.id)).toEqual(['1', '2']);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
