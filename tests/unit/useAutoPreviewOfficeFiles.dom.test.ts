/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

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

vi.mock('@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled', () => ({
  useAutoPreviewOfficeFilesEnabled: () => true,
  isOfficeAutoPreviewTriggerMessage: (message: { type: string }) =>
    ['tool_group', 'tool_call', 'acp_tool_call', 'codex_tool_call'].includes(message.type),
  findNewOfficeFiles: (currentFiles: string[], knownFiles: Set<string>) =>
    currentFiles.filter((filePath) => !knownFiles.has(filePath)),
}));

let responseHandler: ((message: { conversation_id: string; type: string }) => void) | null = null;
let turnCompletedHandler: ((event: { sessionId: string; status: string }) => void) | null = null;
const mockScanInvoke = vi.fn().mockResolvedValue([]);
const mockResponseStreamUnsub = vi.fn();
const mockTurnCompletedUnsub = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: (handler: (message: { conversation_id: string; type: string }) => void) => {
          responseHandler = handler;
          return mockResponseStreamUnsub;
        },
      },
      turnCompleted: {
        on: (handler: (event: { sessionId: string; status: string }) => void) => {
          turnCompletedHandler = handler;
          return mockTurnCompletedUnsub;
        },
      },
    },
    workspaceOfficeWatch: {
      scan: { invoke: (...args: unknown[]) => mockScanInvoke(...args) },
    },
  },
}));

import { useAutoPreviewOfficeFiles } from '../../src/renderer/hooks/file/useAutoPreviewOfficeFiles';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAutoPreviewOfficeFiles', () => {
  const flushEffects = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    responseHandler = null;
    turnCompletedHandler = null;
    mockFindPreviewTab.mockReturnValue(null);
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });
    mockScanInvoke.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures an initial Office-file baseline on mount and unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() =>
      useAutoPreviewOfficeFiles({ conversationId: 'conv-1', workspace: '/workspace' })
    );

    await flushEffects();

    expect(mockScanInvoke).toHaveBeenCalledWith({ workspace: '/workspace' });

    unmount();

    expect(mockResponseStreamUnsub).toHaveBeenCalled();
    expect(mockTurnCompletedUnsub).toHaveBeenCalled();
  });

  it('does nothing when workspace is missing', () => {
    renderHook(() => useAutoPreviewOfficeFiles({ conversationId: 'conv-1', workspace: undefined }));

    expect(mockScanInvoke).not.toHaveBeenCalled();
  });

  it('opens preview when a tool message causes a scan with a new Office file', async () => {
    mockScanInvoke.mockResolvedValueOnce([]).mockResolvedValueOnce(['/workspace/slides.pptx']);

    renderHook(() => useAutoPreviewOfficeFiles({ conversationId: 'conv-1', workspace: '/workspace' }));

    await flushEffects();

    expect(mockScanInvoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      responseHandler?.({ conversation_id: 'conv-1', type: 'tool_call' });
      await vi.advanceTimersByTimeAsync(1500);
    });

    await flushEffects();

    expect(mockOpenPreview).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOpenPreview).toHaveBeenCalledOnce();

    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'ppt',
      expect.objectContaining({
        filePath: '/workspace/slides.pptx',
        fileName: 'slides.pptx',
        workspace: '/workspace',
      })
    );
  });

  it('ignores non-matching conversations and non-trigger messages', async () => {
    mockScanInvoke.mockResolvedValueOnce([]).mockResolvedValue(['/workspace-A/slides.pptx']);

    renderHook(() => useAutoPreviewOfficeFiles({ conversationId: 'conv-1', workspace: '/workspace-A' }));

    await flushEffects();

    expect(mockScanInvoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      responseHandler?.({ conversation_id: 'conv-2', type: 'tool_call' });
      responseHandler?.({ conversation_id: 'conv-1', type: 'text' });
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mockOpenPreview).not.toHaveBeenCalled();
    expect(mockScanInvoke).toHaveBeenCalledTimes(1);
  });

  it('does NOT call openPreview when the preview tab already exists', async () => {
    mockFindPreviewTab.mockReturnValue({ id: 'existing-tab' });
    mockScanInvoke.mockResolvedValueOnce([]).mockResolvedValueOnce(['/workspace/report.docx']);

    renderHook(() => useAutoPreviewOfficeFiles({ conversationId: 'conv-1', workspace: '/workspace' }));

    await flushEffects();

    expect(mockScanInvoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      responseHandler?.({ conversation_id: 'conv-1', type: 'tool_group' });
      await vi.advanceTimersByTimeAsync(1500);
    });

    await flushEffects();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockFindPreviewTab).toHaveBeenCalled();
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('rescans the new workspace when the workspace changes', async () => {
    const { rerender } = renderHook(
      ({ ws }: { ws: string }) => useAutoPreviewOfficeFiles({ conversationId: 'conv-1', workspace: ws }),
      {
        initialProps: { ws: '/workspace-A' },
      }
    );

    await flushEffects();

    expect(mockScanInvoke).toHaveBeenCalledWith({ workspace: '/workspace-A' });

    rerender({ ws: '/workspace-B' });

    await flushEffects();

    expect(mockScanInvoke).toHaveBeenCalledWith({ workspace: '/workspace-B' });
  });

  it('passes the correct content type and file metadata for docx files', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'word' });
    mockScanInvoke.mockResolvedValueOnce([]).mockResolvedValueOnce(['/ws/report.docx']);

    renderHook(() => useAutoPreviewOfficeFiles({ conversationId: 'conv-1', workspace: '/ws' }));

    await flushEffects();

    expect(mockScanInvoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      turnCompletedHandler?.({ sessionId: 'conv-1', status: 'finished' });
      await vi.advanceTimersByTimeAsync(1500);
    });

    await flushEffects();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'word',
      expect.objectContaining({ filePath: '/ws/report.docx', fileName: 'report.docx', workspace: '/ws' })
    );
  });

  it('cancels delayed auto-open timers when the hook unmounts', async () => {
    mockScanInvoke.mockResolvedValueOnce([]).mockResolvedValueOnce(['/workspace/slides.pptx']);

    const { unmount } = renderHook(() =>
      useAutoPreviewOfficeFiles({ conversationId: 'conv-1', workspace: '/workspace' })
    );

    await flushEffects();

    await act(async () => {
      responseHandler?.({ conversation_id: 'conv-1', type: 'tool_call' });
      await vi.advanceTimersByTimeAsync(1500);
    });

    await flushEffects();

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });
});
