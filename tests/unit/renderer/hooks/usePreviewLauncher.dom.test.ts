import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '../../../../src/common/adapter/httpBridge';

const mockReadFile = vi.fn();
const mockGetImageBase64 = vi.fn();
const mockOpenPreview = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readFile: { invoke: (...args: unknown[]) => mockReadFile(...args) },
      getImageBase64: { invoke: (...args: unknown[]) => mockGetImageBase64(...args) },
    },
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    workspace: '/workspace-root',
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: mockOpenPreview,
  }),
}));

import { usePreviewLauncher } from '../../../../src/renderer/hooks/file/usePreviewLauncher';

describe('usePreviewLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('launches markdown preview when file read succeeds', async () => {
    mockReadFile.mockResolvedValue('hello world');
    const { result } = renderHook(() => usePreviewLauncher());

    await act(async () => {
      await result.current.launchPreview({
        relativePath: 'docs/a.md',
        file_name: 'a.md',
        contentType: 'markdown',
        editable: false,
      });
    });

    expect(mockReadFile).toHaveBeenCalledWith({
      path: '/workspace-root/docs/a.md',
      workspace: '/workspace-root',
    });
    expect(mockOpenPreview).toHaveBeenCalledWith(
      'hello world',
      'markdown',
      expect.objectContaining({
        file_name: 'a.md',
        file_path: '/workspace-root/docs/a.md',
        workspace: '/workspace-root',
      })
    );
    expect(result.current.errorKind).toBeNull();
  });

  it('classifies sandbox errors from markdown preview', async () => {
    mockReadFile.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/fs/read',
        status: 403,
        body: { code: 'PATH_OUTSIDE_SANDBOX', error: 'outside sandbox' },
      })
    );
    const { result } = renderHook(() => usePreviewLauncher());

    await act(async () => {
      await result.current.launchPreview({
        relativePath: 'docs/a.md',
        file_name: 'a.md',
        contentType: 'markdown',
        editable: false,
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.errorKind).toBe('sandbox');
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('classifies null markdown reads as not found', async () => {
    mockReadFile.mockResolvedValue(null);
    const { result } = renderHook(() => usePreviewLauncher());

    await act(async () => {
      await result.current.launchPreview({
        relativePath: 'docs/a.md',
        file_name: 'a.md',
        contentType: 'markdown',
        editable: false,
      });
    });

    expect(result.current.errorKind).toBe('not_found');
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('classifies read timeout errors', async () => {
    vi.useFakeTimers();
    mockReadFile.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => usePreviewLauncher());

    await act(async () => {
      const promise = result.current.launchPreview({
        relativePath: 'docs/a.md',
        file_name: 'a.md',
        contentType: 'markdown',
        editable: false,
      });
      await vi.advanceTimersByTimeAsync(5000);
      await promise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.errorKind).toBe('timeout');
  });

  it('passes workspace when opening image previews', async () => {
    mockGetImageBase64.mockResolvedValue('data:image/png;base64,abc');
    const { result } = renderHook(() => usePreviewLauncher());

    await act(async () => {
      await result.current.launchPreview({
        relativePath: 'img/a.png',
        file_name: 'a.png',
        contentType: 'image',
        editable: false,
      });
    });

    expect(mockGetImageBase64).toHaveBeenCalledWith({
      path: '/workspace-root/img/a.png',
      workspace: '/workspace-root',
    });
    expect(mockOpenPreview).toHaveBeenCalledWith(
      'data:image/png;base64,abc',
      'image',
      expect.objectContaining({
        file_path: '/workspace-root/img/a.png',
        workspace: '/workspace-root',
      })
    );
  });

  it('skips file reads for pdf previews', async () => {
    const { result } = renderHook(() => usePreviewLauncher());

    await act(async () => {
      await result.current.launchPreview({
        originalPath: '/workspace-root/a.pdf',
        file_name: 'a.pdf',
        contentType: 'pdf',
        editable: false,
      });
    });

    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'pdf',
      expect.objectContaining({
        file_path: '/workspace-root/a.pdf',
        workspace: '/workspace-root',
      })
    );
  });

  it('propagates truncated metadata for large text previews', async () => {
    mockReadFile.mockResolvedValue('a'.repeat(130_000));
    const { result } = renderHook(() => usePreviewLauncher());

    await act(async () => {
      await result.current.launchPreview({
        relativePath: 'docs/large.md',
        file_name: 'large.md',
        contentType: 'markdown',
        editable: true,
      });
    });

    expect(mockOpenPreview).toHaveBeenCalledWith(
      expect.any(String),
      'markdown',
      expect.objectContaining({
        truncated: true,
        editable: false,
      })
    );
  });
});
