/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the mtime-based file polling feature in PreviewContext:
 * - checkFileUpdate skips read when mtime is unchanged
 * - checkFileUpdate updates tab content when mtime changes
 * - checkFileUpdate skips update when tab isDirty
 * - checkFileUpdate uses getImageBase64 for image content type
 * - checkFileUpdate handles file read errors without breaking state
 * - closeTab clears fileMtimeRef entry for the closed tab
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetFileMetadata = vi.fn();
const mockReadFile = vi.fn();
const mockGetImageBase64 = vi.fn();
const mockWriteFile = vi.fn();
const mockContentUpdateOn = vi.fn(() => vi.fn());
const mockPreviewOpenOn = vi.fn(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: { invoke: (...args: unknown[]) => mockGetFileMetadata(...args) },
      readFile: { invoke: (...args: unknown[]) => mockReadFile(...args) },
      getImageBase64: { invoke: (...args: unknown[]) => mockGetImageBase64(...args) },
      writeFile: { invoke: (...args: unknown[]) => mockWriteFile(...args) },
    },
    fileStream: {
      contentUpdate: { on: (...args: unknown[]) => mockContentUpdateOn(...args) },
    },
    preview: {
      open: { on: (...args: unknown[]) => mockPreviewOpenOn(...args) },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

// Import after mocks
import {
  PreviewProvider,
  usePreviewContext,
} from '../../src/renderer/pages/conversation/Preview/context/PreviewContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(PreviewProvider, null, children);

/** Advance timers by `ms` and flush pending microtasks/promises. */
async function tickPoll(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PreviewContext — mtime file polling (checkFileUpdate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();

    // Default mock behaviour: return mtime 1000 and file content
    mockGetFileMetadata.mockResolvedValue({ lastModified: 1000 });
    mockReadFile.mockResolvedValue('file content');
    mockGetImageBase64.mockResolvedValue('base64data');
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('calls getFileMetadata for the active tab immediately on tab switch', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });

    act(() => {
      result.current.openPreview('initial', 'code', {
        filePath: '/workspace/file.ts',
        language: 'typescript',
      });
    });

    // Flush the immediate checkFileUpdate call triggered by the effect
    await act(async () => {
      await tickPoll();
    });

    expect(mockGetFileMetadata).toHaveBeenCalledWith({ path: '/workspace/file.ts' });
  });

  it('does not read file content when mtime is unchanged between polls', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });

    act(() => {
      result.current.openPreview('initial', 'code', {
        filePath: '/workspace/file.ts',
        language: 'typescript',
      });
    });

    // First immediate call: sets prevMtime = undefined → stores 1000; no content read yet
    await act(async () => {
      await tickPoll();
    });

    vi.clearAllMocks();
    mockGetFileMetadata.mockResolvedValue({ lastModified: 1000 }); // same mtime

    // Next poll at 1s
    await act(async () => {
      await tickPoll(1000);
    });

    expect(mockGetFileMetadata).toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('reads file content and updates the tab when mtime changes', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });

    act(() => {
      result.current.openPreview('initial', 'code', {
        filePath: '/workspace/file.ts',
        language: 'typescript',
      });
    });

    // First immediate call: record initial mtime 1000
    await act(async () => {
      await tickPoll();
    });

    vi.clearAllMocks();
    mockGetFileMetadata.mockResolvedValue({ lastModified: 2000 }); // mtime changed
    mockReadFile.mockResolvedValue('updated content');

    await act(async () => {
      await tickPoll(1000);
    });

    expect(mockReadFile).toHaveBeenCalledWith({ path: '/workspace/file.ts' });
    expect(result.current.activeTab?.content).toBe('updated content');
  });

  it('skips update when the active tab has isDirty = true', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });

    act(() => {
      result.current.openPreview('initial', 'code', {
        filePath: '/workspace/file.ts',
        language: 'typescript',
      });
    });

    // First immediate call: record initial mtime
    await act(async () => {
      await tickPoll();
    });

    // Dirty the tab by editing its content
    act(() => {
      result.current.updateContent('user edits');
    });

    expect(result.current.activeTab?.isDirty).toBe(true);

    vi.clearAllMocks();
    mockGetFileMetadata.mockResolvedValue({ lastModified: 2000 });
    mockReadFile.mockResolvedValue('external update');

    await act(async () => {
      await tickPoll(1000);
    });

    // Tab is dirty — external update must be ignored
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(result.current.activeTab?.content).toBe('user edits');
  });

  it('uses getImageBase64 instead of readFile for image tabs', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });

    act(() => {
      result.current.openPreview('initial-base64', 'image', {
        filePath: '/workspace/photo.png',
      });
    });

    // First immediate call: record initial mtime
    await act(async () => {
      await tickPoll();
    });

    vi.clearAllMocks();
    mockGetFileMetadata.mockResolvedValue({ lastModified: 2000 });
    mockGetImageBase64.mockResolvedValue('new-base64data');

    await act(async () => {
      await tickPoll(1000);
    });

    expect(mockGetImageBase64).toHaveBeenCalledWith({ path: '/workspace/photo.png' });
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(result.current.activeTab?.content).toBe('new-base64data');
  });

  it('does not corrupt tab state when file read rejects', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });

    act(() => {
      result.current.openPreview('stable content', 'code', {
        filePath: '/workspace/file.ts',
        language: 'typescript',
      });
    });

    // First immediate call: record initial mtime
    await act(async () => {
      await tickPoll();
    });

    vi.clearAllMocks();
    mockGetFileMetadata.mockResolvedValue({ lastModified: 2000 });
    mockReadFile.mockRejectedValue(new Error('ENOENT: file not found'));

    await act(async () => {
      await tickPoll(1000);
    });

    // Content must remain unchanged despite read failure
    expect(result.current.activeTab?.content).toBe('stable content');
  });

  it('does not update tab content when getFileMetadata rejects', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });

    act(() => {
      result.current.openPreview('stable content', 'code', {
        filePath: '/workspace/file.ts',
        language: 'typescript',
      });
    });

    // First immediate call: record initial mtime
    await act(async () => {
      await tickPoll();
    });

    vi.clearAllMocks();
    mockGetFileMetadata.mockRejectedValue(new Error('IPC error'));

    await act(async () => {
      await tickPoll(1000);
    });

    expect(mockReadFile).not.toHaveBeenCalled();
    expect(result.current.activeTab?.content).toBe('stable content');
  });
});

describe('PreviewContext — closeTab clears fileMtimeRef', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();

    mockGetFileMetadata.mockResolvedValue({ lastModified: 1000 });
    mockReadFile.mockResolvedValue('file content');
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('resets mtime tracking after closeTab so reopening treats file as fresh', async () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });

    // Open a tab and run two polls so last-known mtime is 2000
    act(() => {
      result.current.openPreview('initial', 'code', {
        filePath: '/workspace/file.ts',
        language: 'typescript',
      });
    });

    // Poll 1: prevMtime=undefined → store 1000, no read
    await act(async () => {
      await tickPoll();
    });

    mockGetFileMetadata.mockResolvedValue({ lastModified: 2000 });
    mockReadFile.mockResolvedValue('updated content');

    // Poll 2 (1s interval): prevMtime=1000, new=2000 → read file; last-known is now 2000
    await act(async () => {
      await tickPoll(1000);
    });

    expect(mockReadFile).toHaveBeenCalledTimes(1);

    const tabId = result.current.activeTabId!;

    // Close the tab — must clear fileMtimeRef entry so last-known mtime is forgotten
    act(() => {
      result.current.closeTab(tabId);
    });

    vi.clearAllMocks();
    // Return a mtime LOWER than last-known (2000 → 500).
    // If closeTab did NOT clear the ref: prevMtime=2000, new=500 → 500≠2000 → read triggered (WRONG).
    // If closeTab DID clear the ref:    prevMtime=undefined → store 500 → no read (CORRECT).
    mockGetFileMetadata.mockResolvedValue({ lastModified: 500 });
    mockReadFile.mockResolvedValue('should-not-appear');

    act(() => {
      result.current.openPreview('initial', 'code', {
        filePath: '/workspace/file.ts',
        language: 'typescript',
      });
    });

    // Advance time to let the immediate check and the first interval fire
    await act(async () => {
      await tickPoll(1000);
    });

    // If mtime was properly cleared, prevMtime was undefined on the first post-reopen check,
    // so the "backward mtime" does NOT trigger a spurious read.
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
