/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { ipcBridge } from '@/common';
import { PreviewProvider, usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: {
      contentUpdate: { on: vi.fn(() => vi.fn()) },
    },
    preview: {
      open: { on: vi.fn(() => vi.fn()) },
    },
    fs: {
      writeFile: { invoke: vi.fn() },
      getFileMetadata: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
}));

describe('PreviewContext', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <PreviewProvider>{children}</PreviewProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes with closed state', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBe(null);
  });

  it('opens preview and creates tab', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('# Hello', 'markdown', { title: 'test.md' });
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].content).toBe('# Hello');
    expect(result.current.tabs[0].content_type).toBe('markdown');
  });

  it('closes preview and clears all tabs', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('content', 'code');
    });
    act(() => {
      result.current.closePreview();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.tabs).toEqual([]);
  });

  it('provides all context API methods', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    expect(typeof result.current.openPreview).toBe('function');
    expect(typeof result.current.closePreview).toBe('function');
    expect(typeof result.current.updateContent).toBe('function');
    expect(typeof result.current.findPreviewTab).toBe('function');
  });

  it('updates content and marks tab as dirty', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('original', 'code');
    });
    expect(result.current.activeTab?.isDirty).toBe(false);
    act(() => {
      result.current.updateContent('modified');
    });
    expect(result.current.activeTab?.content).toBe('modified');
    expect(result.current.activeTab?.isDirty).toBe(true);
  });

  it('exposes reloadTab', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    expect(typeof result.current.reloadTab).toBe('function');
  });

  it('reloadTab re-reads disk content and resets dirty + external-change flags', async () => {
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('disk content');
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue({ lastModified: 42 } as never);

    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('original', 'code', { file_path: '/ws/a.txt', workspace: '/ws' });
    });
    // Local edit makes the tab dirty
    act(() => {
      result.current.updateContent('local edit');
    });
    expect(result.current.activeTab?.isDirty).toBe(true);

    const tabId = result.current.activeTab!.id;
    await act(async () => {
      await result.current.reloadTab(tabId);
    });

    expect(result.current.activeTab?.content).toBe('disk content');
    expect(result.current.activeTab?.originalContent).toBe('disk content');
    expect(result.current.activeTab?.isDirty).toBe(false);
    expect(result.current.activeTab?.hasExternalChange).toBe(false);
  });

  it('reloadTab is a no-op for tabs without a file_path', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('synthetic', 'markdown', { title: 'mem.md' });
    });
    const tabId = result.current.activeTab!.id;
    await act(async () => {
      await result.current.reloadTab(tabId);
    });
    expect(ipcBridge.fs.readFile.invoke).not.toHaveBeenCalled();
    expect(result.current.activeTab?.content).toBe('synthetic');
  });

  it('external content update lights the badge instead of overwriting content', async () => {
    // Capture the contentUpdate handler the provider subscribes with.
    let handler: ((e: { file_path: string; operation?: string }) => void) | undefined;
    vi.mocked(ipcBridge.fileStream.contentUpdate.on).mockImplementation((cb: never) => {
      handler = cb as never;
      return vi.fn();
    });

    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('original', 'code', { file_path: '/ws/a.txt', workspace: '/ws' });
    });

    act(() => {
      handler?.({ file_path: '/ws/a.txt', operation: 'write' });
    });

    // Debounced 500ms; flag flips but content is untouched.
    await waitFor(() => expect(result.current.activeTab?.hasExternalChange).toBe(true));
    expect(result.current.activeTab?.content).toBe('original');
  });
});
