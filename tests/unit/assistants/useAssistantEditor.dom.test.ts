/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/assistant/useAssistantEditor.ts (A2 in N4a).
 * Tests useAssistantEditor hook: core form state management and save/create/delete flows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock @/common
vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      create: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
      delete: { invoke: vi.fn() },
    },
    fs: {
      readAssistantRule: { invoke: vi.fn() },
      readAssistantSkill: { invoke: vi.fn() },
    },
  },
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
}));

import { useAssistantEditor } from '@/renderer/hooks/assistant/useAssistantEditor';
import { ipcBridge } from '@/common';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';

describe('useAssistantEditor', () => {
  const mockMessage = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  } as any;

  const defaultParams = {
    localeKey: 'en',
    activeAssistant: null,
    isExtensionAssistant: () => false,
    setActiveAssistantId: vi.fn(),
    loadAssistants: vi.fn(),
    refreshAgentDetection: vi.fn(),
    message: mockMessage,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state (no active assistant)', () => {
    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    expect(result.current.editVisible).toBe(false);
    expect(result.current.editName).toBe('');
    expect(result.current.isCreating).toBe(false);
  });

  it('handles handleEdit to populate form from active assistant', async () => {
    const assistant: AssistantListItem = {
      id: 'a1',
      name: 'TestAssistant',
      description: 'Test desc',
      avatar: '🤖',
      preset_agent_type: 'claude',
      sort_order: 1,
      source: 'user',
      enabled: true,
    };

    (ipcBridge.fs.readAssistantRule.invoke as any).mockResolvedValue('Rule content');
    (ipcBridge.fs.readAssistantSkill.invoke as any).mockResolvedValue('Skill content');

    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    await act(async () => {
      await result.current.handleEdit(assistant);
    });

    await waitFor(() => expect(result.current.editVisible).toBe(true));

    expect(result.current.editName).toBe('TestAssistant');
    expect(result.current.editDescription).toBe('Test desc');
    expect(result.current.editAvatar).toBe('🤖');
    expect(result.current.editAgent).toBe('claude');
    expect(result.current.isCreating).toBe(false);
  });

  it('calls handleCreate and initializes empty form', () => {
    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    act(() => {
      result.current.handleCreate();
    });

    expect(result.current.isCreating).toBe(true);
    expect(result.current.editVisible).toBe(true);
    expect(result.current.editName).toBe('');
    expect(result.current.editDescription).toBe('');
  });

  it('calls handleSave for creating new assistant', async () => {
    (ipcBridge.assistants.create.invoke as any).mockResolvedValue({ id: 'new-id' });

    const loadAssistantsMock = vi.fn();
    const setActiveAssistantIdMock = vi.fn();

    const { result } = renderHook(() =>
      useAssistantEditor({
        ...defaultParams,
        loadAssistants: loadAssistantsMock,
        setActiveAssistantId: setActiveAssistantIdMock,
      })
    );

    act(() => {
      result.current.handleCreate();
      result.current.setEditName('NewAssistant');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(ipcBridge.assistants.create.invoke).toHaveBeenCalled());
    expect(mockMessage.success).toHaveBeenCalled();
    expect(loadAssistantsMock).toHaveBeenCalled();
    expect(setActiveAssistantIdMock).toHaveBeenCalledWith('new-id');
    expect(result.current.editVisible).toBe(false);
  });

  it('calls handleSave for updating existing assistant', async () => {
    const assistant: AssistantListItem = {
      id: 'a1',
      name: 'Existing',
      sort_order: 1,
      source: 'user',
      enabled: true,
    };

    (ipcBridge.fs.readAssistantRule.invoke as any).mockResolvedValue('');
    (ipcBridge.fs.readAssistantSkill.invoke as any).mockResolvedValue('');
    (ipcBridge.assistants.update.invoke as any).mockResolvedValue({ id: 'a1' });

    const loadAssistantsMock = vi.fn();

    const { result } = renderHook(() =>
      useAssistantEditor({
        ...defaultParams,
        loadAssistants: loadAssistantsMock,
        activeAssistant: assistant,
      })
    );

    await act(async () => {
      await result.current.handleEdit(assistant);
    });

    act(() => {
      result.current.setEditName('UpdatedName');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(ipcBridge.assistants.update.invoke).toHaveBeenCalled());
    expect(mockMessage.success).toHaveBeenCalled();
    expect(loadAssistantsMock).toHaveBeenCalled();
  });

  it('logs error when save fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (ipcBridge.assistants.create.invoke as any).mockRejectedValue(new Error('Backend error'));

    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    act(() => {
      result.current.handleCreate();
      result.current.setEditName('NewAssistant');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(mockMessage.error).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
