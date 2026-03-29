/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for useAutoPreviewOfficeFiles hook.
 *
 * The hook delegates detection to the main process via workspaceOfficeWatch IPC.
 * It starts the watcher on mount, subscribes to fileAdded events, and stops on unmount.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockFindPreviewTab = vi.fn();
const mockOpenPreview = vi.fn();

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    findPreviewTab: mockFindPreviewTab,
    openPreview: mockOpenPreview,
  }),
}));

const mockGetFileTypeInfo = vi.fn();
vi.mock('@/renderer/utils/file/fileType', () => ({
  getFileTypeInfo: (...args: unknown[]) => mockGetFileTypeInfo(...args),
}));

// Capture the fileAdded subscriber so tests can fire it directly
let fileAddedHandler: ((evt: { filePath: string; workspace: string }) => void) | null = null;
const mockStartInvoke = vi.fn().mockResolvedValue({ success: true });
const mockStopInvoke = vi.fn().mockResolvedValue({ success: true });
const mockFileAddedUnsub = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    workspaceOfficeWatch: {
      start: { invoke: (...args: unknown[]) => mockStartInvoke(...args) },
      stop: { invoke: (...args: unknown[]) => mockStopInvoke(...args) },
      fileAdded: {
        on: (handler: (evt: { filePath: string; workspace: string }) => void) => {
          fileAddedHandler = handler;
          return mockFileAddedUnsub;
        },
      },
    },
  },
}));

import { useAutoPreviewOfficeFiles } from '../../src/renderer/hooks/file/useAutoPreviewOfficeFiles';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAutoPreviewOfficeFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileAddedHandler = null;
    mockFindPreviewTab.mockReturnValue(null);
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });
    mockStartInvoke.mockResolvedValue({ success: true });
    mockStopInvoke.mockResolvedValue({ success: true });
  });

  it('calls start on mount and stop on unmount', () => {
    const { unmount } = renderHook(() => useAutoPreviewOfficeFiles('/workspace'));

    expect(mockStartInvoke).toHaveBeenCalledWith({ workspace: '/workspace' });

    unmount();

    expect(mockFileAddedUnsub).toHaveBeenCalled();
    expect(mockStopInvoke).toHaveBeenCalledWith({ workspace: '/workspace' });
  });

  it('does nothing when workspace is undefined', () => {
    renderHook(() => useAutoPreviewOfficeFiles(undefined));

    expect(mockStartInvoke).not.toHaveBeenCalled();
    expect(mockStopInvoke).not.toHaveBeenCalled();
  });

  it('opens preview when fileAdded event fires for current workspace', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });

    renderHook(() => useAutoPreviewOfficeFiles('/workspace'));

    await act(async () => {
      fileAddedHandler?.({ filePath: '/workspace/slides.pptx', workspace: '/workspace' });
    });

    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'ppt',
      expect.objectContaining({ filePath: '/workspace/slides.pptx', fileName: 'slides.pptx' })
    );
  });

  it('ignores fileAdded events from a different workspace', async () => {
    renderHook(() => useAutoPreviewOfficeFiles('/workspace-A'));

    await act(async () => {
      fileAddedHandler?.({ filePath: '/workspace-B/slides.pptx', workspace: '/workspace-B' });
    });

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('does NOT call openPreview when tab is already open', async () => {
    mockFindPreviewTab.mockReturnValue({ id: 'existing-tab' });

    renderHook(() => useAutoPreviewOfficeFiles('/workspace'));

    await act(async () => {
      fileAddedHandler?.({ filePath: '/workspace/report.docx', workspace: '/workspace' });
    });

    expect(mockFindPreviewTab).toHaveBeenCalled();
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('restarts watcher when workspace changes', () => {
    const { rerender } = renderHook(({ ws }: { ws: string }) => useAutoPreviewOfficeFiles(ws), {
      initialProps: { ws: '/workspace-A' },
    });

    expect(mockStartInvoke).toHaveBeenCalledWith({ workspace: '/workspace-A' });

    rerender({ ws: '/workspace-B' });

    expect(mockStopInvoke).toHaveBeenCalledWith({ workspace: '/workspace-A' });
    expect(mockStartInvoke).toHaveBeenCalledWith({ workspace: '/workspace-B' });
  });

  it('passes correct contentType and fileName for docx', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'word' });

    renderHook(() => useAutoPreviewOfficeFiles('/ws'));

    await act(async () => {
      fileAddedHandler?.({ filePath: '/ws/report.docx', workspace: '/ws' });
    });

    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'word',
      expect.objectContaining({ filePath: '/ws/report.docx', fileName: 'report.docx', workspace: '/ws' })
    );
  });
});
