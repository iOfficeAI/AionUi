/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/assistant/useAssistantSkills.ts (A3 in N4a).
 * Tests useAssistantSkills hook: external skill discovery, search, and custom path management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock @/common
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      detectAndCountExternalSkills: { invoke: vi.fn() },
      addCustomExternalPath: { invoke: vi.fn() },
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

import { useAssistantSkills } from '@/renderer/hooks/assistant/useAssistantSkills';
import { ipcBridge } from '@/common';

describe('useAssistantSkills', () => {
  const mockMessage = {
    success: vi.fn(),
    error: vi.fn(),
  } as any;

  const defaultParams = {
    skillsModalVisible: false,
    customSkills: [],
    selectedSkills: [],
    pendingSkills: [],
    availableSkills: [],
    setPendingSkills: vi.fn(),
    setCustomSkills: vi.fn(),
    setSelectedSkills: vi.fn(),
    message: mockMessage,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects external skills when modal opens', async () => {
    const mockSources = [
      { source: 'github', count: 5 },
      { source: 'local', count: 2 },
    ];
    (ipcBridge.fs.detectAndCountExternalSkills.invoke as any).mockResolvedValue(mockSources);

    const { result, rerender } = renderHook((props) => useAssistantSkills(props), { initialProps: defaultParams });

    // Open modal
    rerender({ ...defaultParams, skillsModalVisible: true });

    await waitFor(() => expect(result.current.externalSources).toHaveLength(2));
    expect(result.current.externalSources[0].source).toBe('github');
    expect(result.current.activeSourceTab).toBe('github');
  });

  it('handles empty external skills response', async () => {
    (ipcBridge.fs.detectAndCountExternalSkills.invoke as any).mockResolvedValue([]);

    const { result, rerender } = renderHook((props) => useAssistantSkills(props), { initialProps: defaultParams });

    rerender({ ...defaultParams, skillsModalVisible: true });

    await waitFor(() => expect(ipcBridge.fs.detectAndCountExternalSkills.invoke).toHaveBeenCalled());

    expect(result.current.externalSources).toHaveLength(0);
  });

  it('handles detectAndCountExternalSkills error gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (ipcBridge.fs.detectAndCountExternalSkills.invoke as any).mockRejectedValue(new Error('Detection failed'));

    const { result, rerender } = renderHook((props) => useAssistantSkills(props), { initialProps: defaultParams });

    rerender({ ...defaultParams, skillsModalVisible: true });

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(result.current.externalSources).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it('handles adding custom external path', async () => {
    (ipcBridge.fs.addCustomExternalPath.invoke as any).mockResolvedValue(undefined);
    (ipcBridge.fs.detectAndCountExternalSkills.invoke as any).mockResolvedValue([]);

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    act(() => {
      result.current.setShowAddPathModal(true);
      result.current.setCustomPathName('MyPath');
      result.current.setCustomPathValue('/path/to/skills');
    });

    await act(async () => {
      await result.current.handleAddCustomPath();
    });

    await waitFor(() =>
      expect(ipcBridge.fs.addCustomExternalPath.invoke).toHaveBeenCalledWith({
        name: 'MyPath',
        path: '/path/to/skills',
      })
    );
    expect(mockMessage.success).toHaveBeenCalled();
    expect(result.current.showAddPathModal).toBe(false);
  });

  it('does not add custom path if name or value is empty', async () => {
    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    act(() => {
      result.current.setCustomPathName('');
      result.current.setCustomPathValue('');
    });

    await act(async () => {
      await result.current.handleAddCustomPath();
    });

    expect(ipcBridge.fs.addCustomExternalPath.invoke).not.toHaveBeenCalled();
  });

  it('exposes handleRefreshExternal to manually trigger detection', async () => {
    (ipcBridge.fs.detectAndCountExternalSkills.invoke as any).mockResolvedValue([{ source: 'local', count: 1 }]);

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    await waitFor(() => expect(result.current.externalSources).toHaveLength(1));
  });
});
