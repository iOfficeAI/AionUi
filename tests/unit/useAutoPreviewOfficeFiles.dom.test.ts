/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

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

vi.mock('@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled', () => ({
  useAutoPreviewOfficeFilesEnabled: () => true,
}));

let fileAddedHandler: ((event: { file_path: string; workspace: string }) => void) | null = null;
const mockWatchStartInvoke = vi.fn().mockResolvedValue(undefined);
const mockWatchStopInvoke = vi.fn().mockResolvedValue(undefined);
const mockListWorkspaceFilesInvoke = vi.fn().mockResolvedValue([]);
const mockFileAddedUnsub = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listWorkspaceFiles: {
        invoke: (...args: unknown[]) => mockListWorkspaceFilesInvoke(...args),
      },
    },
    workspaceOfficeWatch: {
      start: { invoke: (...args: unknown[]) => mockWatchStartInvoke(...args) },
      stop: { invoke: (...args: unknown[]) => mockWatchStopInvoke(...args) },
      fileAdded: {
        on: (handler: (event: { file_path: string; workspace: string }) => void) => {
          fileAddedHandler = handler;
          return mockFileAddedUnsub;
        },
      },
    },
  },
}));

import { useAutoPreviewOfficeFiles } from '../../src/renderer/hooks/file/useAutoPreviewOfficeFiles';

describe('useAutoPreviewOfficeFiles', () => {
  const flushEffects = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fileAddedHandler = null;
    mockFindPreviewTab.mockReturnValue(null);
    mockGetFileTypeInfo.mockImplementation((filePath: string) => {
      if (filePath.endsWith('.docx')) return { contentType: 'word' };
      if (filePath.endsWith('.pptx')) return { contentType: 'ppt' };
      if (filePath.endsWith('.xlsx')) return { contentType: 'excel' };
      return { contentType: 'code' };
    });
    mockWatchStartInvoke.mockResolvedValue(undefined);
    mockWatchStopInvoke.mockResolvedValue(undefined);
    mockListWorkspaceFilesInvoke.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts workspace office watch, captures initial baseline, and stops on unmount', async () => {
    mockListWorkspaceFilesInvoke.mockResolvedValue([
      { fullPath: '/workspace/existing.docx', name: 'existing.docx', relativePath: 'existing.docx' },
      { fullPath: '/workspace/notes.md', name: 'notes.md', relativePath: 'notes.md' },
    ]);

    const { unmount } = renderHook(() =>
      useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace: '/workspace' })
    );

    await flushEffects();

    expect(mockWatchStartInvoke).toHaveBeenCalledWith({ workspace: '/workspace' });
    expect(mockListWorkspaceFilesInvoke).toHaveBeenCalledWith({ root: '/workspace' });

    unmount();
    await flushEffects();

    expect(mockFileAddedUnsub).toHaveBeenCalled();
    expect(mockWatchStopInvoke).toHaveBeenCalledWith({ workspace: '/workspace' });
  });

  it('does nothing when workspace is missing', () => {
    renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace: undefined }));

    expect(mockWatchStartInvoke).not.toHaveBeenCalled();
    expect(mockListWorkspaceFilesInvoke).not.toHaveBeenCalled();
  });

  it('opens preview when a new office fileAdded event arrives for the current workspace', async () => {
    renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace: '/workspace' }));
    await flushEffects();

    await act(async () => {
      fileAddedHandler?.({ file_path: '/workspace/slides.pptx', workspace: '/workspace' });
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'ppt',
      expect.objectContaining({
        file_path: '/workspace/slides.pptx',
        file_name: 'slides.pptx',
        workspace: '/workspace',
      })
    );
  });

  it('ignores fileAdded events from other workspaces', async () => {
    renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace: '/workspace-A' }));
    await flushEffects();

    await act(async () => {
      fileAddedHandler?.({ file_path: '/workspace-B/report.docx', workspace: '/workspace-B' });
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('treats /var and /private/var workspace aliases as the same workspace', async () => {
    renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace: '/var/tmp/workspace-A' }));
    await flushEffects();

    await act(async () => {
      fileAddedHandler?.({
        file_path: '/private/var/tmp/workspace-A/report.docx',
        workspace: '/private/var/tmp/workspace-A',
      });
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'word',
      expect.objectContaining({
        file_path: '/private/var/tmp/workspace-A/report.docx',
        file_name: 'report.docx',
        workspace: '/var/tmp/workspace-A',
      })
    );
  });

  it('does not open duplicate previews for baseline files or repeated events', async () => {
    mockListWorkspaceFilesInvoke.mockResolvedValue([
      { fullPath: '/workspace/report.docx', name: 'report.docx', relativePath: 'report.docx' },
    ]);

    renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace: '/workspace' }));
    await flushEffects();

    await act(async () => {
      fileAddedHandler?.({ file_path: '/workspace/report.docx', workspace: '/workspace' });
      fileAddedHandler?.({ file_path: '/workspace/report.docx', workspace: '/workspace' });
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('does not reopen baseline files when the watcher event uses a /private alias', async () => {
    mockListWorkspaceFilesInvoke.mockResolvedValue([
      { fullPath: '/var/tmp/workspace-A/report.docx', name: 'report.docx', relativePath: 'report.docx' },
    ]);

    renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace: '/var/tmp/workspace-A' }));
    await flushEffects();

    await act(async () => {
      fileAddedHandler?.({
        file_path: '/private/var/tmp/workspace-A/report.docx',
        workspace: '/private/var/tmp/workspace-A',
      });
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('does not open preview when the tab already exists', async () => {
    mockFindPreviewTab.mockReturnValue({ id: 'existing-tab' });

    renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace: '/workspace' }));
    await flushEffects();

    await act(async () => {
      fileAddedHandler?.({ file_path: '/workspace/report.docx', workspace: '/workspace' });
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockFindPreviewTab).toHaveBeenCalled();
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('restarts watch and refreshes baseline when the workspace changes', async () => {
    const { rerender } = renderHook(
      ({ workspace }: { workspace: string }) => useAutoPreviewOfficeFiles({ conversation_id: 'conv-1', workspace }),
      {
        initialProps: { workspace: '/workspace-A' },
      }
    );

    await flushEffects();
    expect(mockWatchStartInvoke).toHaveBeenCalledWith({ workspace: '/workspace-A' });
    expect(mockListWorkspaceFilesInvoke).toHaveBeenCalledWith({ root: '/workspace-A' });

    rerender({ workspace: '/workspace-B' });
    await flushEffects();

    expect(mockWatchStopInvoke).toHaveBeenCalledWith({ workspace: '/workspace-A' });
    expect(mockWatchStartInvoke).toHaveBeenCalledWith({ workspace: '/workspace-B' });
    expect(mockListWorkspaceFilesInvoke).toHaveBeenCalledWith({ root: '/workspace-B' });
  });
});
